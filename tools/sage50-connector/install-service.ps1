[CmdletBinding()]
param(
    [string]$InstallDirectory = "$env:ProgramFiles\Bickers Action\Sage 50 Connector",
    [string]$ServiceName = "BickersActionSage50Connector"
)

$ErrorActionPreference = "Stop"
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated PowerShell session."
}

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$executable = Join-Path $InstallDirectory "BickersAction.Sage50Connector.exe"
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
}

New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $InstallDirectory -Recurse -Force

Write-Host "Configure appsettings.json, then install the one-time machine credential:"
& $executable --set-credential

sc.exe create $ServiceName binPath= "`"$executable`"" start= auto `
    DisplayName= "Bickers Action Sage 50 Connector" | Out-Null
sc.exe description $ServiceName `
    "Gated Sage 50 Accounts UK customer lookup and service-invoice connector." | Out-Null
sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/120000/""/0 | Out-Null
Start-Service -Name $ServiceName
Write-Host "Service installed and started. Invoice posting follows the local and server-side kill switches."
