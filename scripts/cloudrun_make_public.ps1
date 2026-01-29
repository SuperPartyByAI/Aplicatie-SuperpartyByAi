# Cloud Run IAM - Make WhatsApp proxy services public (allUsers invoker)
# Required for Firebase Functions Gen2 (Cloud Run) to be accessible from Flutter app
# Run this after deploying Functions to ensure IAM bindings are set

param(
    [string]$ProjectId = "superparty-frontend",
    [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"

Write-Host "🔧 Setting up Cloud Run IAM for WhatsApp proxy services..." -ForegroundColor Cyan
Write-Host "Project: $ProjectId" -ForegroundColor Gray
Write-Host "Region: $Region" -ForegroundColor Gray
Write-Host ""

# List all WhatsApp proxy services
Write-Host "📋 Listing WhatsApp proxy services..." -ForegroundColor Cyan
$servicesOutput = gcloud run services list `
    --project="$ProjectId" `
    --region="$Region" `
    --format="value(metadata.name)" `
    --filter="metadata.name:whatsappproxy*" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Error listing services. Make sure Functions are deployed first." -ForegroundColor Yellow
    exit 1
}

$services = $servicesOutput | Where-Object { $_ -match "whatsappproxy" }

if (-not $services) {
    Write-Host "⚠️  No WhatsApp proxy services found. Make sure Functions are deployed first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Found services:" -ForegroundColor Green
foreach ($service in $services) {
    Write-Host "  - $service" -ForegroundColor Gray
}
Write-Host ""

# Apply IAM binding for each service
Write-Host "🔐 Applying IAM bindings (allUsers -> roles/run.invoker)..." -ForegroundColor Cyan
Write-Host ""

foreach ($service in $services) {
    Write-Host "Processing: $service" -ForegroundColor Yellow
    
    # Check if binding already exists
    $policyOutput = gcloud run services get-iam-policy "$service" `
        --region="$Region" `
        --project="$ProjectId" `
        --format="yaml" 2>&1
    
    if ($policyOutput -match "allUsers" -and $policyOutput -match "roles/run.invoker") {
        Write-Host "  ✓ IAM binding already exists for $service" -ForegroundColor Green
    } else {
        Write-Host "  → Adding IAM binding..." -ForegroundColor Gray
        gcloud run services add-iam-policy-binding "$service" `
            --region="$Region" `
            --member="allUsers" `
            --role="roles/run.invoker" `
            --project="$ProjectId" `
            --quiet
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ IAM binding added successfully" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Failed to add IAM binding" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host ""
}

# Verify bindings
Write-Host "✅ Verifying IAM bindings..." -ForegroundColor Cyan
Write-Host ""

foreach ($service in $services) {
    Write-Host "Service: $service" -ForegroundColor Yellow
    $policyOutput = gcloud run services get-iam-policy "$service" `
        --region="$Region" `
        --project="$ProjectId" `
        --format="yaml" 2>&1
    
    if ($policyOutput -match "allUsers" -and $policyOutput -match "roles/run.invoker") {
        Write-Host "  ✓ IAM binding verified: allUsers has roles/run.invoker" -ForegroundColor Green
    } else {
        Write-Host "  ✗ IAM binding NOT found!" -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

Write-Host "🎉 All WhatsApp proxy services are now publicly accessible (IAM configured)" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Test with: curl -i https://us-central1-superparty-frontend.cloudfunctions.net/whatsappProxyGetAccountsStaff" -ForegroundColor Gray
Write-Host "  2. Should get 401 from your app (not Cloud Run 'not authenticated' error)" -ForegroundColor Gray
Write-Host ""
