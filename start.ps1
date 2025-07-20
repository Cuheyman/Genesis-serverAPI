# PowerShell script to start the Genesis AI Trading API
Write-Host "Starting Genesis AI Trading API..." -ForegroundColor Green

# Change to src directory
Set-Location "src"

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Start the application
Write-Host "Launching server..." -ForegroundColor Cyan
npm start 