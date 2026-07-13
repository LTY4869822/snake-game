<#
  Snake Pro - One-click Deploy Script
  Run: powershell -ExecutionPolicy Bypass -File deploy.ps1
#>

param(
    [ValidateSet("local","docker","prod")]
    [string]$Mode = "local"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host @"
╔══════════════════════════════════════╗
║     🐍 Snake Pro - Deploy Tool      ║
╚══════════════════════════════════════╝
"@ -ForegroundColor Cyan

function Start-Local {
    Write-Host "`n[1/4] Checking environment..." -ForegroundColor Yellow
    if (!(Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Node.js: $(node --version)" -ForegroundColor Green

    Write-Host "`n[2/4] Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location "$ProjectRoot\backend"
    npm install --production 2>&1 | Out-Null
    Write-Host "  Dependencies installed" -ForegroundColor Green

    Write-Host "`n[3/4] Starting backend server..." -ForegroundColor Yellow
    $env:PORT = "3000"
    $env:MONGO_URI = "mongodb://localhost:27017/snake-game"
    $env:JWT_SECRET = "snake-pro-deploy-secret-" + (Get-Random)

    $BackendJob = Start-Job -ScriptBlock {
        param($dir, $envVars)
        Set-Location $dir
        foreach ($kv in $envVars.GetEnumerator()) { [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Process") }
        node server.js
    } -ArgumentList "$ProjectRoot\backend", (Get-Item env:)

    Start-Sleep -Seconds 3
    $backendStatus = Get-Job -Id $BackendJob.Id
    if ($backendStatus.State -eq "Running") {
        Write-Host "  Backend: http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "  Backend may have failed (MongoDB needed)" -ForegroundColor Yellow
    }

    Write-Host "`n[4/4] Starting frontend server..." -ForegroundColor Yellow
    Set-Location "$ProjectRoot"
    $FrontendJob = Start-Job -ScriptBlock {
        param($dir)
        Set-Location $dir
        npx --yes live-server frontend --port=5500 --no-browser --quiet 2>&1 | Out-Null
    } -ArgumentList $ProjectRoot

    Start-Sleep -Seconds 3
    Write-Host "  Frontend: http://localhost:5500" -ForegroundColor Green

    Write-Host @"

╔══════════════════════════════════════╗
║  ✅ Deployment Complete!            ║
║                                      ║
║  🌐 Frontend: http://localhost:5500  ║
║  🔧 Backend:  http://localhost:3000  ║
║  ❤️  Health:   http://localhost:3000  ║
║                    /api/health       ║
║                                      ║
║  ⚠  MongoDB required for full API   ║
║  ℹ  Game works offline without it   ║
╚══════════════════════════════════════╝

Press Ctrl+C to stop all servers
"@ -ForegroundColor Cyan

    # Keep alive
    try {
        while ($true) {
            Start-Sleep -Seconds 5
            if ((Get-Job -Id $BackendJob.Id).State -ne "Running") {
                Write-Host "Backend stopped" -ForegroundColor Red
            }
            if ((Get-Job -Id $FrontendJob.Id).State -ne "Running") {
                Write-Host "Frontend stopped" -ForegroundColor Red
            }
        }
    } finally {
        Get-Job | Stop-Job | Remove-Job
    }
}

function Start-Docker {
    Write-Host "`nStarting full stack with Docker Compose..." -ForegroundColor Yellow
    Set-Location $ProjectRoot
    docker-compose up -d

    if ($LASTEXITCODE -eq 0) {
        Write-Host @"

╔══════════════════════════════════════╗
║  ✅ Docker Stack Running!            ║
║                                      ║
║  🌐 Frontend: http://localhost       ║
║  🔧 Backend:  http://localhost:3000  ║
║  🗄  MongoDB:  localhost:27017       ║
║                                      ║
║  Commands:                           ║
║  docker-compose logs -f  查看日志    ║
║  docker-compose down     停止服务    ║
╚══════════════════════════════════════╝
"@ -ForegroundColor Cyan
    }
}

function Start-Prod {
    Write-Host "`nProduction mode: Build frontend + start backend" -ForegroundColor Yellow

    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    Set-Location "$ProjectRoot\backend"
    npm install --production 2>&1 | Out-Null

    Write-Host "Starting production server..." -ForegroundColor Yellow
    $env:NODE_ENV = "production"
    $env:PORT = "3000"
    $env:MONGO_URI = "mongodb://localhost:27017/snake-game"
    # Serve frontend statically from backend
    node server.js
}

# --- Main ---
switch ($Mode) {
    "local"  { Start-Local }
    "docker" { Start-Docker }
    "prod"   { Start-Prod }
}
