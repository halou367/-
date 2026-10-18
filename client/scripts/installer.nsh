; electron-builder invokes this hook before uninstalling/replacing application files.
; It is also embedded in the new uninstaller. Do not stop apps on wizard startup.
!define BRANA_CLOSE_SCRIPT "${__FILEDIR__}\close-installed-app.ps1"

!macro customCheckAppRunning
  InitPluginsDir
  File /oname=$PLUGINSDIR\brana-close-app.ps1 "${BRANA_CLOSE_SCRIPT}"
  Push $0
  Push $1
  Push $2
  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCpy $1 ""
  ${if} $installMode == "all"
    ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${endif}
  FileOpen $2 "$PLUGINSDIR\brana-close-app.cfg" w
  FileWriteUTF16LE $2 "$INSTDIR$\r$\n$0$\r$\n$1$\r$\n${APP_EXECUTABLE_FILENAME}$\r$\n"
  FileClose $2
  ; NSIS is 32-bit. Use native PowerShell on 64-bit Windows for CIM support.
  StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe" 0 +2
    StrCpy $1 "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe"
  nsExec::Exec /TIMEOUT=60000 `"$1" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\brana-close-app.ps1" -ConfigFile "$PLUGINSDIR\brana-close-app.cfg"`
  Pop $0
  Delete "$PLUGINSDIR\brana-close-app.cfg"
  ${if} $0 != 0
    DetailPrint "Unable to close the old application (exit $0). Installation stopped."
    MessageBox MB_OK|MB_ICONSTOP "Unable to close Brana AI. Close it and its background processes, or run setup as administrator, then retry." /SD IDOK
    SetErrorLevel 2
    Quit
  ${endif}
  Pop $2
  Pop $1
  Pop $0
!macroend

; Never overwrite locked files after a failed old-version uninstall.
!macro branaCheckUninstallResult
  ${if} ${Errors}
  ${orIf} $R0 != 0
    DetailPrint "Old version uninstall failed ($R0). Installation stopped."
    MessageBox MB_OK|MB_ICONSTOP "The old version could not be uninstalled. Close Brana AI or run setup as administrator, then retry." /SD IDOK
    SetErrorLevel 2
    Quit
  ${endif}
!macroend
!macro customUnInstallCheck
  !insertmacro branaCheckUninstallResult
!macroend
!macro customUnInstallCheckCurrentUser
  !insertmacro branaCheckUninstallResult
!macroend

!macro customInstall
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${if} $installMode == "all"
    SetShellVarContext current
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    SetShellVarContext all
  ${endif}
  StrCpy $launchLink "$appExe"
!macroend
