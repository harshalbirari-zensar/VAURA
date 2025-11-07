$chat = @{ 
    message = "share me VINCISTACKCENTOS9 details" 
} | ConvertTo-Json

$result = Invoke-RestMethod -Method Post `
    -Uri "http://localhost:3002/api/chat" `
    -Body $chat `
    -ContentType "application/json"

Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
Write-Host "Response:" -ForegroundColor Cyan
$result.response

Write-Host "`n=== DATA ===" -ForegroundColor Green
$result.data | ConvertTo-Json -Depth 5
