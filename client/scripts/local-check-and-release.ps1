param(
  [switch]$SkipBrowserChecks,
  [switch]$SkipInstallerBuild,
  [switch]$SkipSmokeInstall,
  [switch]$SyncInstalledAsar
)

$ErrorActionPreference = 'Stop'
$ClientDir = Split-Path -Parent $PSScriptRoot
$RepoRoot  = Split-Path -Parent $ClientDir

Write-Host "=== [1/6] 构建探针与前端 Bundle ===" -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  node client/scripts/build-probe.js
  if ($LASTEXITCODE -ne 0) { throw "build-probe.js 失败" }
  node client/scripts/bundle.js
  if ($LASTEXITCODE -ne 0) { throw "bundle.js 失败" }
  node --check client/gen/ui.bundle.js
  if ($LASTEXITCODE -ne 0) { throw "ui.bundle.js 语法检查失败" }
} finally {
  Pop-Location
}

Write-Host "=== [2/6] 单元测试 (client + core-metrics) ===" -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  npm test --prefix client
  if ($LASTEXITCODE -ne 0) { throw "client 单元测试失败" }
  npm test --prefix packages/core-metrics
  if ($LASTEXITCODE -ne 0) { throw "core-metrics 单元测试失败" }
} finally {
  Pop-Location
}

Write-Host "=== [3/6] Windows Electron 运行时回归检查 ===" -ForegroundColor Cyan
Push-Location $ClientDir
try {
  $electronExe = Resolve-Path 'node_modules/electron/dist/electron.exe' -ErrorAction SilentlyContinue
  if (-not $electronExe) {
    $unpackedExe = Join-Path $ClientDir 'release/win-unpacked/Brana AI.exe'
    if (Test-Path $unpackedExe) { $electronExe = $unpackedExe }
  }
  if ($electronExe) {
    $winScripts = @(
      'scripts/check-privacy-electron.cjs',
      'scripts/check-runtime-electron.cjs',
      'scripts/check-auth-route-electron.cjs',
      'scripts/check-extension-storage-electron.cjs',
      'scripts/check-browser-chrome-electron.cjs',
      'scripts/check-browser-navigation-electron.cjs',
      'scripts/check-browser-viewport-electron.cjs'
    )
    foreach ($script in $winScripts) {
      Write-Host "  -> Electron 检查: $script"
      $p = Start-Process -FilePath $electronExe -ArgumentList '--no-sandbox', $script -NoNewWindow -Wait -PassThru
      if ($p.ExitCode -ne 0) { throw "Windows runtime regression failed ($script): $($p.ExitCode)" }
    }
  } else {
    Write-Warning "未找到本地 electron.exe，跳过 Electron 进程级检查"
  }

  if (-not $SkipBrowserChecks) {
    $browserScripts = @(
      'scripts/check-connection-browser.cjs',
      'scripts/check-auth-browser.cjs',
      'scripts/check-node-browser.cjs',
      'scripts/check-route-editors-browser.cjs',
      'scripts/check-history-browser.cjs',
      'scripts/check-workspace-browser.cjs',
      'scripts/check-draw-titles-browser.cjs',
      'scripts/check-html-preview-browser.cjs',
      'scripts/check-interactive-card-browser.cjs',
      'scripts/check-browser-mode-browser.cjs',
      'scripts/check-extensions-toolbar-browser.cjs',
      'scripts/check-bookmarks-browser.cjs',
      'scripts/check-offline-modes-browser.cjs',
      'scripts/check-gacha-captcha-browser.cjs'
    )
    foreach ($script in $browserScripts) {
      Write-Host "  -> Browser 检查: $script"
      node $script
      if ($LASTEXITCODE -ne 0) { throw "Browser regression failed ($script)" }
    }
  }
} finally {
  Pop-Location
}

Write-Host "=== [4/6] Xray (VLESS) 与代理 DNS 检查 ===" -ForegroundColor Cyan
Push-Location $ClientDir
try {
  if (-not (Test-Path 'bin/xray.exe')) {
    New-Item -ItemType Directory -Force -Path bin | Out-Null
    Invoke-WebRequest -Uri https://github.com/XTLS/Xray-core/releases/latest/download/Xray-windows-64.zip -OutFile xray.zip
    Expand-Archive xray.zip -DestinationPath bin -Force
    Remove-Item xray.zip
  }
  $env:BRANA_XRAY = (Resolve-Path 'bin/xray.exe').Path
  node scripts/check-proxy-dns.cjs
  if ($LASTEXITCODE -ne 0) { throw "check-proxy-dns.cjs 失败" }
} finally {
  Pop-Location
}

if (-not $SkipInstallerBuild) {
  Write-Host "=== [5/6] 打包 NSIS 安装程序与 CRC 校验 ===" -ForegroundColor Cyan
  Push-Location $ClientDir
  try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    npx electron-builder --win nsis --x64 --publish never
    if ($LASTEXITCODE -ne 0) { throw "NSIS 打包失败" }
    $v = node -p "require('./package.json').version"
    $setupExe = Join-Path $ClientDir "release/BranaAi-Setup-$v.exe"
    node scripts/nsis-check.js $setupExe
    if ($LASTEXITCODE -ne 0) { throw "安装包 NSIS CRC 完整性检查失败" }
    $hash = (Get-FileHash $setupExe -Algorithm SHA256).Hash.ToLower()
    Write-Host "SHA256: $hash  BranaAi-Setup-$v.exe" -ForegroundColor Green

    if (-not $SkipSmokeInstall) {
      Write-Host "=== [6/6] 静默安装 + 70s 冒烟自检 + 静默卸载 ===" -ForegroundColor Cyan
      $dir = Join-Path $env:TEMP 'BranaAiSmokeTest'
      $profile = Join-Path $env:TEMP 'BranaAiSmokeProfile'
      if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
      if (Test-Path $profile) { Remove-Item $profile -Recurse -Force }
      $p = Start-Process -FilePath $setupExe -ArgumentList '/S', "/D=$dir" -Wait -PassThru
      if ($p.ExitCode -ne 0) { throw "静默安装失败: $($p.ExitCode)" }
      $appProcess = Start-Process -FilePath "$dir/Brana AI.exe" -ArgumentList "--user-data-dir=$profile" -PassThru
      try {
        Start-Sleep -Seconds 70
        $appProcess.Refresh()
        if ($appProcess.HasExited) { throw "冒烟测试期间主进程退出: $($appProcess.ExitCode)" }
        $logFile = Join-Path $profile 'logs/runtime.jsonl'
        if (-not (Test-Path $logFile)) { throw "未生成 runtime.jsonl" }
        if (Select-String -Path $logFile -Pattern '"event":"(startup-failed|main-exception|window-open-failed)"' -Quiet) {
          throw "runtime.jsonl 报告启动异常"
        }
      } finally {
        if (-not $appProcess.HasExited) { taskkill /F /T /PID $appProcess.Id | Out-Null }
      }
      $u = Get-ChildItem $dir -Filter 'Uninstall*.exe' | Select-Object -First 1
      node scripts/nsis-check.js $u.FullName
      if ($LASTEXITCODE -ne 0) { throw "卸载程序 CRC 校验失败" }
      $p = Start-Process -FilePath $u.FullName -ArgumentList '/S', "_?=$dir" -Wait -PassThru
      if ($p.ExitCode -ne 0) { throw "静默卸载失败: $($p.ExitCode)" }
    }
  } finally {
    Pop-Location
  }
}

Write-Host "=== 全部本地检查与构建流程通过 ===" -ForegroundColor Green
