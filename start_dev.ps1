# Operatium Local Development Startup Script
# This script launches the Frontend, Backend API, and ARQ Worker in separate windows.

Write-Host "Starting Operatium Local Development Environment..." -ForegroundColor Cyan
Write-Host "Make sure your Redis server is running (e.g., via Docker or Windows Redis)!" -ForegroundColor Yellow
Start-Sleep -Seconds 2

$rootDir = Get-Location

# 1. Start the Backend API Server
Write-Host "Starting FastAPI Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\venv\Scripts\activate; fastapi dev app/main.py"

# 2. Start the ARQ Worker (for heavy AI tasks)
Write-Host "Starting ARQ Worker..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; .\venv\Scripts\activate; arq app.worker.WorkerSettings"

# 3. Start the Frontend Vite Server
Write-Host "Starting Frontend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "All processes have been launched in separate windows!" -ForegroundColor Cyan
Write-Host "You can close those windows when you are done developing." -ForegroundColor Gray
