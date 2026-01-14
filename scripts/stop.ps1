# Stop All Services
Write-Host "🛑 Stopping Capstone Platform..." -ForegroundColor Cyan

docker compose down
docker compose -f docker-compose.monitoring.yml down 2>$null

Write-Host "✅ Platform stopped." -ForegroundColor Green
