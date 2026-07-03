Clear-Host

Write-Host "========================================"
Write-Host "        ASH AUTONOMOUS DEV WINDOW        "
Write-Host "========================================"
Write-Host ""
Write-Host "Ash is running on this PC."
Write-Host "Mode: autonomous development"
Write-Host "Default: dry-run safe mode"
Write-Host ""

while ($true) {
  Write-Host ""
  Write-Host "----------------------------------------"
  Write-Host ("Cycle started: " + (Get-Date))
  Write-Host "----------------------------------------"

  node .\ash-auto-dev.js --cycles 1 --dry-run

  Write-Host ""
  Write-Host "Next cycle in 10 seconds. Press Ctrl+C to stop."
  Start-Sleep -Seconds 10
}
