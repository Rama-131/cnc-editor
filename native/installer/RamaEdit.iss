#ifndef AppVersion
#define AppVersion "0.2.3"
#endif
[Setup]
AppId={{52F58A0A-B980-4764-9CA0-401938F87EF9}
AppName=Rama Edit
AppVersion={#AppVersion}
AppPublisher=Rama
DefaultDirName={localappdata}\Programs\Rama Edit
DefaultGroupName=Rama Edit
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=..\artifacts\installer
OutputBaseFilename=RamaEdit-Setup-{#AppVersion}-x64
SetupIconFile=..\RamaEdit.Windows\rama-edit.ico
UninstallDisplayIcon={app}\RamaEdit.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
[Tasks]
Name: "desktopicon"; Description: "Crea un'icona sul desktop"; GroupDescription: "Collegamenti:"
[Files]
Source: "..\artifacts\win-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autoprograms}\Rama Edit"; Filename: "{app}\RamaEdit.exe"
Name: "{autodesktop}\Rama Edit"; Filename: "{app}\RamaEdit.exe"; Tasks: desktopicon
[Run]
Filename: "{app}\RamaEdit.exe"; Description: "Avvia Rama Edit"; Flags: nowait postinstall skipifsilent
