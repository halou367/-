; Isolated executable: no installation, registry writes, shortcuts or uninstallation.
Unicode true
RequestExecutionLevel user
SilentInstall silent
Name "Brana installer hook regression"
OutFile "${TEST_OUTPUT}"
!include LogicLib.nsh
!define INSTALL_REGISTRY_KEY "Software\BranaInstallerFixture-NoInstalledProduct"
!define APP_EXECUTABLE_FILENAME "BranaInstallerFixture.exe"
Var installMode
!include "..\scripts\installer.nsh"
Section
  !ifdef TEST_UNINSTALL_ERROR
    StrCpy $R0 1
    !insertmacro customUnInstallCheck
  !else
    !insertmacro customCheckAppRunning
  !endif
  SetErrorLevel 0
SectionEnd
