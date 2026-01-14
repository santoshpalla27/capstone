# Start All Services
Write-Host "🚀 Starting Capstone Platform - Stage 1" -ForegroundColor Cyan

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Copy .env if not exists
if (-not (Test-Path ".env")) {
    Write-Host "📋 Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
}

# Start infrastructure
Write-Host "`n📦 Starting infrastructure (Redis, MySQL, Kafka)..." -ForegroundColor Cyan
docker compose up -d redis mysql zookeeper kafka

Write-Host "⏳ Waiting for infrastructure to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Start backend and frontend
Write-Host "`n🔧 Starting backend and frontend..." -ForegroundColor Cyan
docker compose up -d backend frontend

Write-Host "`n✅ Platform started!" -ForegroundColor Green
Write-Host @"

Endpoints:
  Frontend:    http://localhost:3000
  Backend API: http://localhost:8080
  Health:      http://localhost:8080/health

To view logs:
  docker compose logs -f

To start monitoring:
  docker compose -f docker-compose.monitoring.yml up -d
"@
