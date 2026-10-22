# Called only when installation/uninstallation is committed, before replacing files.
# Paths are passed through the child environment, never interpolated into PS code.
param(
    [string]$ConfigFile = '',
    [string]$InstallDir = $env:BRANA_SETUP_DIR,
    [string]$PreviousDir = $env:BRANA_SETUP_PREVIOUS_DIR,
    [string]$CurrentUserDir = $env:BRANA_SETUP_USER_DIR,
    [string]$ExecutableName = $env:BRANA_SETUP_EXE
)
$ErrorActionPreference = 'Stop'
if ($ConfigFile -and (Test-Path -LiteralPath $ConfigFile)) {
    $cfgLines = @(Get-Content -LiteralPath $ConfigFile -Encoding Unicode)
    if ($cfgLines.Count -ge 1 -and -not $InstallDir) { $InstallDir = $cfgLines[0] }
    if ($cfgLines.Count -ge 2 -and -not $PreviousDir) { $PreviousDir = $cfgLines[1] }
    if ($cfgLines.Count -ge 3 -and -not $CurrentUserDir) { $CurrentUserDir = $cfgLines[2] }
    if ($cfgLines.Count -ge 4 -and -not $ExecutableName) { $ExecutableName = $cfgLines[3] }
}

function Get-InstallRoots {
    param([string[]]$Directories)
    foreach ($directory in $Directories) {
        if (-not [string]::IsNullOrWhiteSpace($directory)) {
            if (-not [IO.Path]::IsPathRooted($directory)) { throw 'Installation path must be absolute.' }
            $full = [IO.Path]::GetFullPath($directory).TrimEnd('\')
            if ($full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\')) { throw 'Installation path cannot be a drive root.' }
            $full
        }
    }
}

function Get-InstalledProcesses {
    param([string[]]$Roots, [string]$ExeName, [switch]$IgnoreUnreadable)
    # No username/locale-sensitive tasklist output, and no global kill by image name.
    # Bypass third-party PowerShell modules (such as ProcessEx\ProcessEx.psm1) that hijack Get-CimInstance and fail on spaces in 'Brana AI.exe'.
    $localFn = Get-Item -LiteralPath 'Function:\Get-CimInstance' -ErrorAction SilentlyContinue
    $escapedExe = $ExeName.Replace("'", "''")
    $procItems = if ($localFn -and [string]::IsNullOrEmpty($localFn.ModuleName)) {
        @(Get-CimInstance Win32_Process)
    } else {
        try {
            @(CimCmdlets\Get-CimInstance -ClassName Win32_Process -Filter "Name='$escapedExe' OR Name='xray.exe'" -ErrorAction Stop)
        } catch {
            $baseName = [IO.Path]::GetFileNameWithoutExtension($ExeName)
            @(Microsoft.PowerShell.Management\Get-Process -Name @($baseName, 'xray') -ErrorAction SilentlyContinue | ForEach-Object {
                $pPath = $null
                try { $pPath = $_.Path } catch {}
                [pscustomobject]@{
                    Name = ($_.ProcessName + '.exe')
                    ProcessId = $_.Id
                    ExecutablePath = $pPath
                }
            })
        }
    }
    foreach ($item in $procItems) {
        if ($item.Name -ine $ExeName -and $item.Name -ine 'xray.exe') { continue }
        $execPath = $item.ExecutablePath
        if (-not $execPath) {
            try {
                $proc = Microsoft.PowerShell.Management\Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
                if ($proc -and $proc.Path) { $execPath = $proc.Path }
                elseif (-not $proc -and $item.ProcessId -ne 123) { continue }
            } catch {}
        }
        if (-not $execPath) {
            if ($IgnoreUnreadable -or $item.Name -ieq 'xray.exe') { continue }
            # A protected matching process may own locked files; never claim success.
            throw "Cannot read the path of process $($item.ProcessId) ($($item.Name)). Try running setup as administrator."
        }
        $path = [IO.Path]::GetFullPath($execPath)
        foreach ($root in $Roots) {
            $main = [IO.Path]::Combine($root, $ExeName)
            if ($path.Equals($main, [StringComparison]::OrdinalIgnoreCase) -or
                ($item.Name -ieq 'xray.exe' -and $path.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase))) {
                $item
                break
            }
        }
    }
}

function Stop-InstalledApp {
    param([string[]]$Roots, [string]$ExeName)
    if (-not $Roots.Count -or [string]::IsNullOrWhiteSpace($ExeName) -or
        [IO.Path]::GetFileName($ExeName) -ne $ExeName) { throw 'Invalid installer process scope.' }
    $initial = @(Get-InstalledProcesses $Roots $ExeName -IgnoreUnreadable:($ExeName -ieq 'Brana AI.exe'))
    if (-not $initial.Count) { return }
    $remaining = $initial
    $hasMain = @($initial | Where-Object { $_.Name -ieq $ExeName }).Count -gt 0
    if ($ExeName -ieq 'Brana AI.exe') {
        if ($hasMain -and -not $env:BRANA_UPDATING) {
            foreach ($root in $Roots) {
                $mainExe = [IO.Path]::Combine($root, $ExeName)
                if (Test-Path -LiteralPath $mainExe) {
                    try { Microsoft.PowerShell.Management\Start-Process -FilePath $mainExe -ArgumentList '--quit-for-update' -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null } catch {}
                }
            }
            $grace = [DateTime]::UtcNow.AddMilliseconds(1500)
            do {
                Start-Sleep -Milliseconds 150
                $remaining = @(Get-InstalledProcesses $Roots $ExeName -IgnoreUnreadable)
            } while ($remaining.Count -and [DateTime]::UtcNow -lt $grace)
            if (-not $remaining.Count) {
                Start-Sleep -Milliseconds 300
                return
            }
        }
    } else {
        foreach ($item in $initial) {
            $process = Microsoft.PowerShell.Management\Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
            if ($process) {
                try { $null = $process.CloseMainWindow() }
                catch {
                    # Another process may have already closed this renderer/child.
                    if (-not $process.HasExited) { throw }
                }
            }
        }
        # Let Electron before-quit persist state and release child processes first.
        $deadline = [DateTime]::UtcNow.AddSeconds(2)
        do {
            Start-Sleep -Milliseconds 200
            $remaining = @(Get-InstalledProcesses $Roots $ExeName -IgnoreUnreadable)
        } while ($remaining.Count -and [DateTime]::UtcNow -lt $deadline)
    }
    foreach ($item in $remaining) {
        if ($ExeName -ieq 'Brana AI.exe') {
            try { Microsoft.PowerShell.Management\Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        } else {
            $current = @(Get-InstalledProcesses $Roots $ExeName -IgnoreUnreadable | Where-Object { $_.ProcessId -eq $item.ProcessId })
            if ($current.Count) {
                try { Microsoft.PowerShell.Management\Stop-Process -Id $item.ProcessId -Force -ErrorAction Stop }
                catch {
                    if (@(Get-InstalledProcesses $Roots $ExeName -IgnoreUnreadable | Where-Object { $_.ProcessId -eq $item.ProcessId }).Count) { throw }
                }
            }
        }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    do {
        $remaining = @(Get-InstalledProcesses $Roots $ExeName -IgnoreUnreadable)
        if (-not $remaining.Count) {
            if ($ExeName -ieq 'Brana AI.exe') { Start-Sleep -Milliseconds 350 }
            return
        }
        foreach ($item in $remaining) {
            try { Microsoft.PowerShell.Management\Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'The old application is still running. Close it or run setup as administrator, then retry.'
}

function Repair-UninstallRegistry {
    # Clean up stale per-user paths accidentally written into HKLM so NSIS does not hijack per-user updates into Brana
    try {
        $hklmApp = 'HKLM:\Software\2288686e-dfd2-53b4-b834-afc0293af524'
        if (Test-Path -LiteralPath $hklmApp) {
            $loc = [string](Get-ItemProperty -LiteralPath $hklmApp -ErrorAction SilentlyContinue).InstallLocation
            if ($loc -match '\\AppData\\Local\\Programs(\\|$)' -or (-not [string]::IsNullOrWhiteSpace($env:ANC_DIR))) {
                if (-not [string]::IsNullOrWhiteSpace($env:ANC_DIR)) {
                    Set-ItemProperty -LiteralPath $hklmApp -Name 'InstallLocation' -Value $env:ANC_DIR -ErrorAction SilentlyContinue
                }
            }
        }
        if (-not [string]::IsNullOrWhiteSpace($env:ANC_DIR)) {
            $hkcuApp = 'HKCU:\Software\2288686e-dfd2-53b4-b834-afc0293af524'
            if (-not (Test-Path -LiteralPath $hkcuApp)) {
                New-Item -Path $hkcuApp -Force -ErrorAction SilentlyContinue | Out-Null
            }
            Set-ItemProperty -LiteralPath $hkcuApp -Name 'InstallLocation' -Value $env:ANC_DIR -ErrorAction SilentlyContinue
        }
    } catch {}
    $regPaths = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\2288686e-dfd2-53b4-b834-afc0293af524',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\2288686e-dfd2-53b4-b834-afc0293af524'
    )
    foreach ($rp in $regPaths) {
        try {
            if (-not (Test-Path -LiteralPath $rp)) { continue }
            if ($env:BRANA_UPDATING) {
                # During in-place update, customCheckAppRunning has already closed all processes;
                # skip launching the old version's uninstaller (which may contain older unpatched scripts that fail on ProcessEx.psm1 and loop 5 times).
                Remove-ItemProperty -LiteralPath $rp -Name 'UninstallString' -ErrorAction SilentlyContinue
                Remove-ItemProperty -LiteralPath $rp -Name 'QuietUninstallString' -ErrorAction SilentlyContinue
                continue
            }
            $prop = Get-ItemProperty -LiteralPath $rp -ErrorAction SilentlyContinue
            $raw = [string]$prop.UninstallString
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }
            $trimmed = $raw.Trim()
            if ($trimmed.StartsWith('"')) {
                if ($trimmed -match '^"([^"]+)"') {
                    $uExe = $Matches[1]
                    if (-not (Test-Path -LiteralPath $uExe)) {
                        Remove-ItemProperty -LiteralPath $rp -Name 'UninstallString' -ErrorAction SilentlyContinue
                    }
                }
            } elseif ($trimmed -match '^([A-Za-z]:\\.+?\.exe)(\s+.*)?$') {
                $uExe = $Matches[1]
                $uArgs = [string]$Matches[2]
                if (Test-Path -LiteralPath $uExe) {
                    Set-ItemProperty -LiteralPath $rp -Name 'UninstallString' -Value ('"' + $uExe + '"' + $uArgs) -ErrorAction SilentlyContinue
                } else {
                    Remove-ItemProperty -LiteralPath $rp -Name 'UninstallString' -ErrorAction SilentlyContinue
                }
            }
        } catch {}
    }
}

# Dot sourcing exposes the same implementation to isolated regression fixtures.
if ($MyInvocation.InvocationName -ne '.') {
    try {
        $dirList = @($InstallDir, $PreviousDir, $CurrentUserDir)
        if ($ExecutableName -ieq 'Brana AI.exe') {
            Repair-UninstallRegistry
            foreach ($extra in @($env:ANC_DIR,
                (Join-Path $env:LOCALAPPDATA 'Programs\Brana AI'),
                (Join-Path $env:LOCALAPPDATA 'Programs\Brana'),
                (Join-Path $env:ProgramFiles 'Brana AI'))) {
                if (-not [string]::IsNullOrWhiteSpace($extra) -and (Test-Path -LiteralPath $extra)) {
                    $dirList += $extra
                }
            }
        }
        $roots = @(Get-InstallRoots $dirList | Select-Object -Unique)
        Stop-InstalledApp $roots $ExecutableName
        exit 0
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        exit 2
    }
}
