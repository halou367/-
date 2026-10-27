; electron-builder invokes this hook before uninstalling/replacing application files.
; It is also embedded in the new uninstaller. Do not stop apps on wizard startup.
!define BRANA_CLOSE_SCRIPT "${__FILEDIR__}\close-installed-app.ps1"
!define BRANA_ALT_GUID "45b79f8b-4a8e-52f8-9c6d-619f5b15654e"
!define BRANA_ALT_INSTALL_KEY "Software\${BRANA_ALT_GUID}"
!define BRANA_ALT_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${BRANA_ALT_GUID}"

!macro branaSyncSiblingDir TARGET_DIR
  ${if} "${TARGET_DIR}" != ""
  ${andIf} "${TARGET_DIR}" != "$INSTDIR"
    ${if} ${FileExists} "${TARGET_DIR}\${APP_EXECUTABLE_FILENAME}"
    ${orIf} ${FileExists} "${TARGET_DIR}\resources\app.asar"
      Delete "${TARGET_DIR}\BranaAI-*.exe"
      Delete "${TARGET_DIR}\BranaAI.exe"
      CopyFiles /SILENT "$INSTDIR\resources\app.asar" "${TARGET_DIR}\resources\app.asar"
      CopyFiles /SILENT "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "${TARGET_DIR}\${APP_EXECUTABLE_FILENAME}"
    ${endif}
  ${endif}
!macroend

!macro customInit
  Push $0
  Push $1
  ReadEnvStr $0 "ANC_DIR"
  ${if} $0 == ""
  ${andIf} "${APP_EXECUTABLE_FILENAME}" == "Brana AI.exe"
    ${ifNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
      ${if} $1 != ""
      ${andIf} ${FileExists} "$1\${APP_EXECUTABLE_FILENAME}"
        StrCpy $0 "$1"
      ${endif}
      ${if} $0 == ""
        ReadRegStr $1 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
        ${if} $1 != ""
        ${andIf} ${FileExists} "$1\${APP_EXECUTABLE_FILENAME}"
          StrCpy $0 "$1"
        ${endif}
      ${endif}
      ${if} $0 == ""
        ReadRegStr $1 HKCU "${BRANA_ALT_INSTALL_KEY}" InstallLocation
        ${if} $1 != ""
        ${andIf} ${FileExists} "$1\${APP_EXECUTABLE_FILENAME}"
          StrCpy $0 "$1"
        ${endif}
      ${endif}
      ${if} $0 == ""
        ReadRegStr $1 HKLM "${BRANA_ALT_INSTALL_KEY}" InstallLocation
        ${if} $1 != ""
        ${andIf} ${FileExists} "$1\${APP_EXECUTABLE_FILENAME}"
          StrCpy $0 "$1"
        ${endif}
      ${endif}
      ${if} $0 == ""
      ${andIf} ${FileExists} "D:\Program Files\Brana AI\${APP_EXECUTABLE_FILENAME}"
        StrCpy $0 "D:\Program Files\Brana AI"
      ${endif}
      ${if} $0 == ""
      ${andIf} ${FileExists} "C:\Program Files\Brana AI\${APP_EXECUTABLE_FILENAME}"
        StrCpy $0 "C:\Program Files\Brana AI"
      ${endif}
    ${endif}
  ${endif}
  ${if} $0 != ""
    ${if} ${FileExists} "$0\${APP_EXECUTABLE_FILENAME}"
    ${orIf} ${FileExists} "$0\*.*"
      StrCpy $INSTDIR "$0"
      StrCpy $hasPerMachineInstallation "0"
      StrCpy $installMode "CurrentUser"
      SetShellVarContext current
      WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
      WriteRegStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$0"
    ${endif}
  ${endif}
  ${if} "${APP_EXECUTABLE_FILENAME}" == "Brana AI.exe"
    !ifdef UNINSTALL_REGISTRY_KEY
      DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
      DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    !endif
    DeleteRegValue HKCU "${BRANA_ALT_UNINSTALL_KEY}" "UninstallString"
    DeleteRegValue HKCU "${BRANA_ALT_UNINSTALL_KEY}" "QuietUninstallString"
    DeleteRegValue HKLM "${BRANA_ALT_UNINSTALL_KEY}" "UninstallString"
    DeleteRegValue HKLM "${BRANA_ALT_UNINSTALL_KEY}" "QuietUninstallString"
  ${endif}
  Pop $1
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
  Delete "$INSTDIR\BranaAI.exe"
  ReadEnvStr $2 "BRANA_UPDATING"
  ${if} ${isUpdated}
  ${orIf} $2 == "1"
    !ifdef UNINSTALL_REGISTRY_KEY
      DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
      DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    !endif
  ${endif}
  StrCpy $1 "0"
  ${if} "${APP_EXECUTABLE_FILENAME}" != "Brana AI.exe"
    StrCpy $1 "1"
  ${endif}
  ${if} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ClearErrors
    FileOpen $2 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
    ${if} ${Errors}
      StrCpy $1 "1"
    ${else}
      FileClose $2
    ${endif}
    ClearErrors
  ${endif}
  ${if} $1 == "0"
  ${andIf} ${FileExists} "$INSTDIR\resources\bin\xray.exe"
    ClearErrors
    FileOpen $2 "$INSTDIR\resources\bin\xray.exe" a
    ${if} ${Errors}
      StrCpy $1 "1"
    ${else}
      FileClose $2
    ${endif}
    ClearErrors
  ${endif}
  ${if} $1 == "0"
  ${andIf} ${FileExists} "$INSTDIR\resources\bin\win-mem-trim.exe"
    ClearErrors
    FileOpen $2 "$INSTDIR\resources\bin\win-mem-trim.exe" a
    ${if} ${Errors}
      StrCpy $1 "1"
    ${else}
      FileClose $2
    ${endif}
    ClearErrors
  ${endif}
  ${if} $1 == "0"
  ${andIf} ${FileExists} "$INSTDIR\resources\app.asar"
    ClearErrors
    FileOpen $2 "$INSTDIR\resources\app.asar" a
    ${if} ${Errors}
      StrCpy $1 "1"
    ${else}
      FileClose $2
    ${endif}
    ClearErrors
  ${endif}
  ${if} $1 == "0"
  ${andIf} "${APP_EXECUTABLE_FILENAME}" == "Brana AI.exe"
  ${andIf} ${FileExists} "D:\Program Files\Brana AI\Brana AI.exe"
    ClearErrors
    FileOpen $2 "D:\Program Files\Brana AI\Brana AI.exe" a
    ${if} ${Errors}
      StrCpy $1 "1"
    ${else}
      FileClose $2
    ${endif}
    ClearErrors
  ${endif}
  StrCmp $1 "0" _brana_skip_ps_close 0
    ; NSIS is 32-bit. Use native PowerShell on 64-bit Windows for CIM support only when executable is locked.
    StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
    ${if} ${FileExists} "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe"
      StrCpy $1 "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe"
    ${endif}
    nsExec::Exec /TIMEOUT=60000 `"$1" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\brana-close-app.ps1" -ConfigFile "$PLUGINSDIR\brana-close-app.cfg"`
    Pop $0
  _brana_skip_ps_close:
  Delete "$INSTDIR\BranaAI-*.exe"
  Delete "$INSTDIR\BranaAI.exe"
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

!macro customUnInit
  ${ifNot} ${isUpdated}
    Push $0
    Push $1
    Push $2
    StrCpy $1 "0"
    ${if} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ClearErrors
      FileOpen $2 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
      ${if} ${Errors}
        StrCpy $1 "1"
      ${else}
        FileClose $2
      ${endif}
      ClearErrors
    ${endif}
    ${if} $1 == "0"
    ${andIf} ${FileExists} "$INSTDIR\resources\bin\xray.exe"
      ClearErrors
      FileOpen $2 "$INSTDIR\resources\bin\xray.exe" a
      ${if} ${Errors}
        StrCpy $1 "1"
      ${else}
        FileClose $2
      ${endif}
      ClearErrors
    ${endif}
    ${if} $1 == "1"
      InitPluginsDir
      File /oname=$PLUGINSDIR\brana-close-app.ps1 "${BRANA_CLOSE_SCRIPT}"
      FileOpen $2 "$PLUGINSDIR\brana-close-app.cfg" w
      FileWriteUTF16LE $2 "$INSTDIR$\r$\n$\r$\n$\r$\n${APP_EXECUTABLE_FILENAME}$\r$\n"
      FileClose $2
      StrCpy $1 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
      ${if} ${FileExists} "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe"
        StrCpy $1 "$WINDIR\SysNative\WindowsPowerShell\v1.0\powershell.exe"
      ${endif}
      nsExec::Exec /TIMEOUT=60000 `"$1" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\brana-close-app.ps1" -ConfigFile "$PLUGINSDIR\brana-close-app.cfg"`
      Pop $0
      Delete "$PLUGINSDIR\brana-close-app.cfg"
    ${endif}
    Delete "$INSTDIR\BranaAI-*.exe"
    Delete "$INSTDIR\BranaAI.exe"
    Pop $2
    Pop $1
    Pop $0
  ${endif}
!macroend

; Never overwrite locked files after a failed old-version uninstall,
; but do not abort when the old uninstaller is missing/unquoted (${Errors} with $R0 == 0)
; or during an in-place overwrite/update after customCheckAppRunning already closed all processes.
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
      ClearErrors
      DetailPrint "Old version uninstaller returned $R0; continuing in-place installation to repair files."
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
  ${if} "${APP_EXECUTABLE_FILENAME}" == "Brana AI.exe"
    !insertmacro branaSyncSiblingDir "$LOCALAPPDATA\Programs\Brana AI"
    !insertmacro branaSyncSiblingDir "C:\Program Files\Brana AI"
    !insertmacro branaSyncSiblingDir "D:\Program Files\Brana AI"
    !insertmacro branaSyncSiblingDir "E:\Program Files\Brana AI"
  ${endif}
  StrCpy $launchLink "$appExe"
!macroend
