$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $project
$cloudflared = Join-Path $project "cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
  Write-Host "cloudflared.exe not found in project folder." -ForegroundColor Red
  Write-Host "Place cloudflared.exe here, then run this script again." -ForegroundColor Yellow
  exit 1
}
Write-Host "Starting FNF Browser Jam server..." -ForegroundColor Cyan
$server = Start-Process powershell -PassThru -WindowStyle Minimized -ArgumentList "-NoExit","-Command","Set-Location '$project'; npm run server"
Start-Sleep -Seconds 4
Write-Host "Starting public tunnel..." -ForegroundColor Cyan
& $cloudflared tunnel --url http://localhost:3000
if ($server -and -not $server.HasExited) {
  Write-Host "Stopping local server..." -ForegroundColor Yellow
  Stop-Process -Id $server.Id -Force
}
