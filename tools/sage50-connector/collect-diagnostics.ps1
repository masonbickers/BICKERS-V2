param(
    [string[]]$SdoSearchPath = @(),
    [string]$ComProgId = "",
    [string]$CompanyDataPath = ""
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
$result = [ordered]@{
    capturedAtUtc = [DateTime]::UtcNow.ToString("o")
    machineName = [Environment]::MachineName
    windows = [ordered]@{
        caption = [string]$os.Caption
        version = [string]$os.Version
        osArchitecture = [string]$os.OSArchitecture
        processArchitecture = if ([Environment]::Is64BitProcess) { "64-bit" } else { "32-bit" }
    }
    installedComponents = @(Get-InstalledProducts)
    discoveredSdoFiles = @(Get-SdoFiles)
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
