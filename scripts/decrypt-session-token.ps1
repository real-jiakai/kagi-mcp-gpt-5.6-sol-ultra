[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$credentialPath = Join-Path `
  ([Environment]::GetFolderPath("ApplicationData")) `
  "kagi-session-mcp\session-token.dpapi"

if (-not (Test-Path -LiteralPath $credentialPath -PathType Leaf)) {
  [Console]::Error.WriteLine(
    "Kagi credential is not configured. Run scripts\store-session-token.ps1 first."
  )
  exit 2
}

try {
  $encryptedToken = Get-Content -Raw -LiteralPath $credentialPath
  $secureToken = ConvertTo-SecureString $encryptedToken
  $credential = [System.Management.Automation.PSCredential]::new(
    "kagi-session",
    $secureToken
  )
  [Console]::Out.Write($credential.GetNetworkCredential().Password)
}
catch {
  [Console]::Error.WriteLine(
    "The Kagi credential could not be loaded for this Windows user."
  )
  exit 2
}
