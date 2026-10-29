# set-bb-secrets.ps1
# Legt die BuchhaltungsButler-Zugangsdaten eines Profils (= ein BB-Kundenkonto) DPAPI-verschlüsselt
# unter %LOCALAPPDATA%\bb-mcp\<Profil>\ ab. Nur dein Windows-Benutzerkonto auf diesem Rechner kann sie
# wieder entschlüsseln. start-bb-mcp.mjs --profile <Profil> liest sie von dort.
#
# Aufruf in einer normalen PowerShell (NICHT in einer Claude-Code-Sitzung):
#   powershell -ExecutionPolicy Bypass -File .\set-bb-secrets.ps1 -Profil it-service
#
# Die Eingabe erfolgt verdeckt per Read-Host -AsSecureString. Dadurch landen die Werte
# weder im Bildschirm noch in der PowerShell-Verlaufsdatei (PSReadLine).

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$Profil
)

$ErrorActionPreference = 'Stop'
$dir = Join-Path (Join-Path $env:LOCALAPPDATA 'bb-mcp') $Profil
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host "Profil: $Profil"

foreach ($name in 'BB_API_CLIENT', 'BB_API_SECRET', 'BB_API_KEY') {
    $secure = Read-Host -AsSecureString "$name (Eingabe verdeckt, leer = überspringen)"
    if ($secure.Length -eq 0) { Write-Host "  $name übersprungen"; continue }
    # ConvertFrom-SecureString ohne -Key = DPAPI, Bereich CurrentUser
    $secure | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $dir "$name.dpapi") -NoNewline
}

# Kontrolle: entschlüsseln und nur die Länge anzeigen, nie den Wert
foreach ($name in 'BB_API_CLIENT', 'BB_API_SECRET', 'BB_API_KEY') {
    $file = Join-Path $dir "$name.dpapi"
    if (-not (Test-Path -LiteralPath $file)) { Write-Warning "$name fehlt"; continue }
    $len = [Net.NetworkCredential]::new('', (Get-Content -LiteralPath $file | ConvertTo-SecureString)).Password.Length
    Write-Host ("  {0}: gespeichert, {1} Zeichen" -f $name, $len)
}
Write-Host "Ablage: $dir"
