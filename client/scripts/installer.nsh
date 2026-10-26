; electron-builder invokes this hook before uninstalling/replacing application files.
; It is also embedded in the new uninstaller. Do not stop apps on wizard startup.
!define BRANA_CLOSE_SCRIPT "${__FILEDIR__}\close-installed-app.ps1"

!macro customInit
  Push $0
  ReadEnvStr $0 "ANC_DIR"
  ${if} $0 != ""
    IfFileExists "$0\${APP_EXECUTABLE_FILENAME}" +2 0
    IfFileExists "$0\*.*" 0 +7
      StrCpy $INSTDIR "$0"
      StrCpy $hasPerMachineInstallation "0"
      StrCpy $installMode "CurrentUser"
      SetShellVarContext current
      WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
      WriteRegStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
  ${endif}
  Pop $0
!macroend

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
  StrCpy $0 "0"
  Delete "$INSTDIR\BranaAI-*.exe"
  ${if} ${isUpdated}
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  ${endif}
  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 _brana_skip_ps_close
    ClearErrors
    FileOpen $2 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
    ${ifNot} ${Errors}
      FileClose $2
      Goto _brana_skip_ps_close
    ${endif}
    ClearErrors
    ; NSIS is 32-bit. Use native PowerShell on 64-bit Windows for CIM support only when executable is locked.
    StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
    IfFileExists "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe" 0 +2
      StrCpy $1 "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe"
    nsExec::Exec /TIMEOUT=60000 `"$1" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\brana-close-app.ps1" -ConfigFile "$PLUGINSDIR\brana-close-app.cfg"`
    Pop $0
  _brana_skip_ps_close:
  Delete "$INSTDIR\BranaAI-*.exe"
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

; Never overwrite locked files after a failed old-version uninstall,
; but do not abort when the old uninstaller is missing/unquoted (${Errors} with $R0 == 0)
; or during an in-place --updated run after customCheckAppRunning already closed all processes.
!macro branaCheckUninstallResult
  !ifdef TEST_UNINSTALL_ERROR
    ${if} ${Errors}
    ${orIf} $R0 != 0
      DetailPrint "Old version uninstall failed ($R0). Installation stopped."
      MessageBox MB_OK|MB_ICONSTOP "The old version could not be uninstalled. Close Brana AI or run setup as administrator, then retry." /SD IDOK
      SetErrorLevel 2
      Quit
    ${endif}
  !else
    ${if} ${Errors}
      ClearErrors
      DetailPrint "Old version uninstaller was not launched or already removed ($R0); continuing in-place installation."
    ${elseif} $R0 != 0
      ${if} ${isUpdated}
        ClearErrors
        DetailPrint "Old version uninstaller returned $R0 during update; continuing in-place installation to repair files."
      ${else}
        DetailPrint "Old version uninstall failed ($R0). Installation stopped."
        MessageBox MB_OK|MB_ICONSTOP "The old version could not be uninstalled. Close Brana AI or run setup as administrator, then retry." /SD IDOK
        SetErrorLevel 2
        Quit
      ${endif}
    ${endif}
  !endif
!macroend
!macro customUnInstallCheck
  !insertmacro branaCheckUninstallResult
!macroend
!macro customUnInstallCheckCurrentUser
  !insertmacro branaCheckUninstallResult
!macroend

!macro customInstall
  ${if} $installMode == "all"
    SetShellVarContext current
    Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
    SetShellVarContext all
  ${endif}
  StrCpy $launchLink "$appExe"
!macroend
