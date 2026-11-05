[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9.-]{3,50}$')][string]$IdentityName,
    [Parameter(Mandatory)][ValidatePattern('^CN=.+')][string]$Publisher,
    [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$PublisherDisplayName,
    [string]$PublishDirectory = "$PSScriptRoot/../artifacts/win-x64",
    [string]$OutputDirectory = "$PSScriptRoot/../artifacts/store",
    [string]$MakeAppxPath
)
$ErrorActionPreference = "Stop"
$PublishDirectory = [IO.Path]::GetFullPath($PublishDirectory)
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
if (-not (Test-Path (Join-Path $PublishDirectory "RamaEdit.exe"))) {
    throw "Manca RamaEdit.exe: eseguire prima dotnet publish."
}
[xml]$props = Get-Content "$PSScriptRoot/../Directory.Build.props" -Raw
$version = [version]([string]$props.Project.PropertyGroup.Version + ".0")
if ($version.Revision -ne 0 -or $version.Major -gt 65535 -or $version.Minor -gt 65535 -or $version.Build -gt 65535) {
    throw "Versione MSIX non valida."
}
if (-not $MakeAppxPath) {
    $kits = Join-Path ([Environment]::GetFolderPath("ProgramFilesX86")) "Windows Kits/10/bin"
    $MakeAppxPath = Get-ChildItem "$kits/*/x64/MakeAppx.exe" -ErrorAction SilentlyContinue |
        Sort-Object { [version]$_.Directory.Parent.Name } -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $MakeAppxPath -or -not (Test-Path $MakeAppxPath)) { throw "Windows SDK MakeAppx.exe non trovato." }
$work = Join-Path ([IO.Path]::GetTempPath()) ("rama-msix-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $work, $OutputDirectory | Out-Null
try {
    Get-ChildItem $PublishDirectory -File | Where-Object Extension -ne ".pdb" | Copy-Item -Destination $work
    Copy-Item "$PSScriptRoot/Assets" $work -Recurse
    [xml]$manifest = Get-Content "$PSScriptRoot/AppxManifest.xml" -Raw
    $ns = [Xml.XmlNamespaceManager]::new($manifest.NameTable)
    $ns.AddNamespace("p", "http://schemas.microsoft.com/appx/manifest/foundation/windows10")
    $identity = $manifest.SelectSingleNode("/p:Package/p:Identity", $ns)
    $identity.SetAttribute("Name", $IdentityName)
    $identity.SetAttribute("Publisher", $Publisher)
    $identity.SetAttribute("Version", $version.ToString())
    $manifest.SelectSingleNode("/p:Package/p:Properties/p:PublisherDisplayName", $ns).InnerText = $PublisherDisplayName
    $manifest.Save((Join-Path $work "AppxManifest.xml"))
    $package = Join-Path $OutputDirectory ("RamaEdit-Store-" + $version + "-x64.msix")
    & $MakeAppxPath pack /d $work /p $package /o
    if ($LASTEXITCODE -ne 0) { throw "Creazione MSIX non riuscita." }
    # This is an upload package, not a signed installer. Microsoft signs the
    # package after Partner Center submission and certification.
    "Pacchetto da caricare in Partner Center, non da installare direttamente." |
        Set-Content (Join-Path $OutputDirectory "LEGGIMI.txt") -Encoding utf8
    Write-Output $package
}
finally {
    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
}
