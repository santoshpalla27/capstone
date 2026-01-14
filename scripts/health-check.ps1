# Health Check Script
Write-Host "🔍 Checking platform health..." -ForegroundColor Cyan

$services = @(
    @{ Name = "Redis"; Port = 6379 },
    @{ Name = "MySQL"; Port = 3306 },
    @{ Name = "Kafka"; Port = 9092 },
    @{ Name = "Backend"; Port = 8080; Path = "/health" },
    @{ Name = "Frontend"; Port = 3000 }
)

foreach ($svc in $services) {
    try {
        if ($svc.Path) {
            $response = Invoke-WebRequest -Uri "http://localhost:$($svc.Port)$($svc.Path)" -TimeoutSec 5 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Host "  ✅ $($svc.Name): UP" -ForegroundColor Green
            } else {
                Write-Host "  ⚠️ $($svc.Name): DEGRADED (Status: $($response.StatusCode))" -ForegroundColor Yellow
            }
        } else {
            $tcpClient = New-Object System.Net.Sockets.TcpClient
            $tcpClient.Connect("localhost", $svc.Port)
            if ($tcpClient.Connected) {
                Write-Host "  ✅ $($svc.Name): UP" -ForegroundColor Green
            }
            $tcpClient.Close()
        }
    } catch {
        Write-Host "  ❌ $($svc.Name): DOWN" -ForegroundColor Red
    }
}
