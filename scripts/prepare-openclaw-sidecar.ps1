# prepare-openclaw-sidecar.ps1
# Downloads Node.js 22 LTS + openclaw@2026.4.2 for Windows x64 sidecar
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/prepare-openclaw-sidecar.ps1

$ErrorActionPreference = "Stop"

$OPENCLAW_VERSION = "2026.4.2"
$NODE_VERSION = "22.14.0"
$PLATFORM = "win-x64"
$SIDECAR_DIR = "apps/desktop/sidecar/$PLATFORM"

Write-Host "=== OpenClaw Sidecar Builder ===" -ForegroundColor Green

# Create sidecar directory
New-Item -ItemType Directory -Force -Path $SIDECAR_DIR | Out-Null

# Download Node.js
$nodeUrl = "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$PLATFORM.zip"
$nodeZip = "$SIDECAR_DIR/node.zip"

if (-not (Test-Path "$SIDECAR_DIR/node.exe")) {
    Write-Host "Downloading Node.js v$NODE_VERSION..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing

    Write-Host "Extracting Node.js..." -ForegroundColor Yellow
    Expand-Archive -Path $nodeZip -DestinationPath "$SIDECAR_DIR/temp" -Force
    Copy-Item "$SIDECAR_DIR/temp/node-v$NODE_VERSION-$PLATFORM/node.exe" "$SIDECAR_DIR/node.exe"
    Remove-Item "$SIDECAR_DIR/temp" -Recurse -Force
    Remove-Item $nodeZip
    Write-Host "Node.js ready: $SIDECAR_DIR/node.exe" -ForegroundColor Green
} else {
    Write-Host "Node.js already exists, skipping" -ForegroundColor Gray
}

# Install openclaw
Write-Host "Installing openclaw@$OPENCLAW_VERSION..." -ForegroundColor Yellow
Push-Location $SIDECAR_DIR
npm init -y 2>$null | Out-Null
npm install "openclaw@$OPENCLAW_VERSION" --no-save 2>&1 | Select-String "added|up to date"
Pop-Location

# Verify
if (Test-Path "$SIDECAR_DIR/node.exe") {
    Write-Host ""
    Write-Host "=== Sidecar ready ===" -ForegroundColor Green
    Write-Host "  Node: $SIDECAR_DIR/node.exe"
    Write-Host "  OpenClaw: $SIDECAR_DIR/node_modules/openclaw/"
    $size = (Get-ChildItem $SIDECAR_DIR -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  Total size: $([math]::Round($size, 1)) MB"
} else {
    Write-Host "ERROR: Sidecar build failed" -ForegroundColor Red
    exit 1
}
