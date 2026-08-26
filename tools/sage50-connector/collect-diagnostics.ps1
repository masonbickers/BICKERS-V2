param(
    [string[]]$SdoSearchPath = @(),
    [string]$ComProgId = "SDOEngine.33",
    [string]$CompanyDataPath = "",
    [string]$ExpectedSageVersion = "33.1.359.0"
)

$ErrorActionPreference = "Stop"

function Get-InstalledProducts {
    $rows = @()
    $roots = @(
        "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    foreach ($root in $roots) {
        $rows += Get-ItemProperty -Path $root -ErrorAction SilentlyContinue |
            Where-Object {
                $_.DisplayName -match "Sage 50 Accounts|Sage Data Objects|\bSDO\b"
            } |
            ForEach-Object {
                [ordered]@{
                    name = [string]$_.DisplayName
                    version = [string]$_.DisplayVersion
                    architectureRegistryView = if ($root -match "WOW6432Node") { "32-bit" } else { "64-bit" }
                }
            }
    }
    return @($rows)
}

function Get-SdoFiles {
    $rows = @()
    foreach ($path in $SdoSearchPath) {
        if (-not (Test-Path -LiteralPath $path -PathType Container)) { continue }
        $rows += Get-ChildItem -LiteralPath $path -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "sdo|sage" -and $_.Extension -eq ".dll" } |
            ForEach-Object {
                [ordered]@{
                    fileName = $_.Name
                    fileVersion = [string]$_.VersionInfo.FileVersion
                    productVersion = [string]$_.VersionInfo.ProductVersion
                }
            }
    }
    return @($rows)
}

$comIdentity = $null
if ($ComProgId) {
    $progIdPath = "Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\$ComProgId\CLSID"
    $clsid = (Get-ItemProperty -Path $progIdPath -ErrorAction SilentlyContinue)."(default)"
    if ($clsid) {
        $comIdentity = [ordered]@{ progId = $ComProgId; clsid = [string]$clsid }
    }
}

$os = Get-CimInstance Win32_OperatingSystem
$processArchitecture = if ([Environment]::Is64BitProcess) { "x64" } else { "x86" }
$installedProducts = @(Get-InstalledProducts)
$sdoFiles = @(Get-SdoFiles)
$detectedSageVersions = @($installedProducts |
    Where-Object { $_.name -match "Sage 50 Accounts" } |
    ForEach-Object { $_.version })
$result = [ordered]@{
    capturedAtUtc = [DateTime]::UtcNow.ToString("o")
    machineName = [Environment]::MachineName
    windows = [ordered]@{
        caption = [string]$os.Caption
        version = [string]$os.Version
        osArchitecture = [string]$os.OSArchitecture
        processArchitecture = $processArchitecture
    }
    target = [ordered]@{
        sageVersion = $ExpectedSageVersion
        sdoProgId = $ComProgId
        connectorRuntimeIdentifier = "win-$processArchitecture"
        exactSageVersionDetected = [bool]($detectedSageVersions -contains $ExpectedSageVersion)
    }
    installedComponents = $installedProducts
    discoveredSdoFiles = $sdoFiles
    registeredComIdentity = $comIdentity
    companyDataAccessible = if ($CompanyDataPath) {
        [bool](Test-Path -LiteralPath $CompanyDataPath)
    } else {
        $null
    }
}

# The report intentionally omits the company-data path, Sage credentials and
# connector credential. Redirect this JSON to an access-controlled evidence file.
$result | ConvertTo-Json -Depth 6
