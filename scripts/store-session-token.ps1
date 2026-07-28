[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$credentialDirectory = Join-Path `
  ([Environment]::GetFolderPath("ApplicationData")) `
  "kagi-session-mcp"
$credentialPath = Join-Path $credentialDirectory "session-token.dpapi"

$secureToken = Read-Host `
  "Paste your Kagi Session Link or raw session token" `
  -AsSecureString

if ($secureToken.Length -lt 16) {
  throw "The Kagi credential is empty or unexpectedly short."
}

$encryptedToken = ConvertFrom-SecureString $secureToken
New-Item -ItemType Directory -Force -Path $credentialDirectory | Out-Null
Set-Content `
  -LiteralPath $credentialPath `
  -Value $encryptedToken `
  -Encoding ascii `
  -NoNewline

Write-Host ""
Write-Host "Kagi credential stored with Windows DPAPI."
Write-Host "You can close this window."
