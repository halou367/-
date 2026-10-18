param([string]$HookExe, [string]$UninstallErrorExe)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\scripts\close-installed-app.ps1"
function Assert($condition, $message) {
    if (-not $condition) { throw $message }
    Write-Output "PASS: $message"
}
function Invoke-TestHook([string]$Path, [string]$Arguments = '/S') {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Path
    $info.Arguments = $Arguments
    $info.UseShellExecute = $false
    $process = [Diagnostics.Process]::Start($info)
    try { $process.WaitForExit(); return $process.ExitCode }
    finally { $process.Dispose() }
}
$temp = Join-Path ([IO.Path]::GetTempPath()) ('brana-setup-test-' + [Guid]::NewGuid())
$children = @()
try {
    $old = Join-Path $temp "old user's 安装"
    $new = Join-Path $temp 'new'
    $other = $old + '-other'
    $null = New-Item -ItemType Directory -Path $old,$new,$other
    $name = 'BranaInstallerFixture.exe'
    $source = 'public class SetupFixture { public static void Main() { System.Threading.Thread.Sleep(120000); } }'
    Add-Type -TypeDefinition $source -OutputAssembly (Join-Path $old $name) -OutputType ConsoleApplication
    Copy-Item (Join-Path $old $name) (Join-Path $new $name)
    Copy-Item (Join-Path $old $name) (Join-Path $other $name)
    Copy-Item (Join-Path $old $name) (Join-Path $old 'xray.exe')
    foreach ($file in @((Join-Path $old $name),(Join-Path $new $name),(Join-Path $other $name),(Join-Path $old 'xray.exe'))) {
        $children += Start-Process -FilePath $file -PassThru
    }
    Start-Sleep -Milliseconds 500
    $roots = @(Get-InstallRoots @($old.ToUpperInvariant(),$new,''))
    $found = @(Get-InstalledProcesses $roots $name)
    Assert ($found.Count -eq 3) 'old/new roots, case, apostrophe and Unicode; sibling path excluded'
    Stop-InstalledApp $roots $name
    Assert (@(Get-InstalledProcesses $roots $name).Count -eq 0) 'main and orphan xray exited before proceeding'
    Assert (-not $children[2].HasExited) 'same executable in unrelated directory remains running'
    Stop-InstalledApp $roots $name
    Assert $true 'already closed application succeeds'
    $rejected = $false
    try { $null = Get-InstallRoots @('C:\') } catch { $rejected = $true }
    Assert $rejected 'drive root rejected'
    $rejected = $false
    try { Stop-InstalledApp $roots '..\wrong.exe' } catch { $rejected = $true }
    Assert $rejected 'invalid executable scope rejected'

    if ($HookExe) {
        $children += Start-Process -FilePath (Join-Path $old $name) -PassThru
        $children += Start-Process -FilePath (Join-Path $old 'xray.exe') -PassThru
        Start-Sleep -Milliseconds 500
        # /D must be the final, unquoted NSIS argument, including embedded spaces.
        $hookExit = Invoke-TestHook $HookExe ('/S /D=' + $old)
        Assert ($hookExit -eq 0) 'compiled NSIS hook passes Unicode/quoted paths via environment'
        Assert (@(Get-InstalledProcesses $roots $name).Count -eq 0) 'compiled hook waits until fixture processes exit'
        Assert (-not $children[2].HasExited) 'compiled hook preserves unrelated fixture'
        $hookExit = Invoke-TestHook $HookExe '/S /D=C:\'
        Assert ($hookExit -eq 2) 'compiled hook returns nonzero on unsafe scope'
        $hookExit = Invoke-TestHook $UninstallErrorExe
        Assert ($hookExit -eq 2) 'uninstall failure stops NSIS before replacement'
    }

    # Failure injection exercises the production enumeration, without touching real apps.
    function Get-CimInstance { @([pscustomobject]@{Name=$name;ProcessId=123;ExecutablePath=$null}) }
    $rejected = $false
    try { Get-InstalledProcesses $roots $name } catch { $rejected = $true }
    Assert $rejected 'unreadable matching process path fails closed'
    Remove-Item Function:Get-CimInstance
} finally {
    foreach ($child in $children) { if (-not $child.HasExited) { $child.Kill(); $child.WaitForExit() } }
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
