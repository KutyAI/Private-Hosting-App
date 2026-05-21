; MC Hosting Windows Installer Configuration
; This file configures the NSIS installer for code signing and distribution

[Setup]
AppName=MC Hosting
AppVersion=0.2.0
AppPublisher=MC Hosting
AppPublisherURL=https://mchosting.local
AppSupportURL=https://mchosting.local/support
AppUpdatesURL=https://mchosting.local/updates
DefaultDirName={autopf}\MC Hosting
DefaultGroupName=MC Hosting
AllowNoIcons=yes
OutputDir=dist\installer
OutputBaseFilename=MC-Hosting-Setup-0.2.0
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
Source: "dist\desktop-ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\host-agent\*"; DestDir: "{app}\agent"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "dist\shared-types\*"; DestDir: "{app}\shared"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MC Hosting"; Filename: "{app}\ui\MC Hosting.exe"
Name: "{group}\{cm:UninstallProgram,MC Hosting}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\MC Hosting"; Filename: "{app}\ui\MC Hosting.exe"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\MC Hosting"; Filename: "{app}\ui\MC Hosting.exe"; Tasks: quicklaunchicon

[Run]
Filename: "{app}\agent\host-agent.exe"; Description: "Start MC Hosting Agent"; Flags: nowait postinstall skipifsilent runhidden
Filename: "{app}\ui\MC Hosting.exe"; Description: "Launch MC Hosting"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
begin
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Register Windows service for host agent
    // This runs with elevated privileges
  end;
end;
