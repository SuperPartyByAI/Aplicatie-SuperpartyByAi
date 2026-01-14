param(
  [Parameter(Mandatory = $false)]
  [string]$BaseUrl = $env:CONNECTOR_BASE_URL
)

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  Write-Host "Missing CONNECTOR_BASE_URL (or -BaseUrl)."
  exit 1
}

$env:CONNECTOR_BASE_URL = $BaseUrl

Write-Host "Running WhatsApp smoke test against $BaseUrl"
node "whatsapp-connector/scripts/whatsapp_smoke_test.js"
