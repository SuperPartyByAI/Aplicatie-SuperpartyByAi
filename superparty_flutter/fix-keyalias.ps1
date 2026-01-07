# Fix keyAlias in key.properties
$keyPropertiesPath = "android\key.properties"

Write-Host "Fixing keyAlias in $keyPropertiesPath..." -ForegroundColor Yellow

# Read content
$content = Get-Content $keyPropertiesPath -Raw

# Replace superparty-key with upload
$content = $content -replace 'keyAlias=superparty-key', 'keyAlias=upload'

# Write back
Set-Content $keyPropertiesPath -Value $content -NoNewline

Write-Host "✓ Fixed! keyAlias is now 'upload'" -ForegroundColor Green

# Verify
Write-Host "`nVerifying..." -ForegroundColor Cyan
Get-Content $keyPropertiesPath | Select-String "keyAlias"

Write-Host "`nNow run:" -ForegroundColor Yellow
Write-Host "  flutter clean" -ForegroundColor White
Write-Host "  flutter build appbundle --release" -ForegroundColor White
Write-Host "  keytool -printcert -jarfile build\app\outputs\bundle\release\app-release.aab | Select-String 'SHA1'" -ForegroundColor White
