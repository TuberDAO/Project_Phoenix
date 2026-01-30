param()

Write-Host "== Phoenix: Firewall rules for Postgres on 127.0.0.1:55433 ==" -ForegroundColor Cyan

# Clean old rules (avoid duplicates)
Get-NetFirewallRule -DisplayName "Phoenix Allow Loopback 55433 In"  -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "Phoenix Allow Loopback 55433 Out" -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "Phoenix Allow Docker 55433 In"    -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-NetFirewallRule -DisplayName "Phoenix Allow Node 55433 Out"     -ErrorAction SilentlyContinue | Remove-NetFirewallRule

# Main loopback rules
New-NetFirewallRule -DisplayName "Phoenix Allow Loopback 55433 In"  -Direction Inbound  -LocalAddress 127.0.0.1 -LocalPort 55433 -Protocol TCP -Action Allow -Profile Any
New-NetFirewallRule -DisplayName "Phoenix Allow Loopback 55433 Out" -Direction Outbound -RemoteAddress 127.0.0.1 -RemotePort 55433 -Protocol TCP -Action Allow -Profile Any

# Allow Docker backend to listen on 55433
$docker = "$Env:ProgramFiles\Docker\Docker\resources\com.docker.backend.exe"
if (Test-Path $docker) {
  New-NetFirewallRule -DisplayName "Phoenix Allow Docker 55433 In" -Direction Inbound -Program $docker -LocalPort 55433 -Protocol TCP -Action Allow -Profile Any
}

# Allow Node.js to connect out to 55433
$node = (Get-Command node).Source
if (Test-Path $node) {
  New-NetFirewallRule -DisplayName "Phoenix Allow Node 55433 Out" -Direction Outbound -Program $node -RemotePort 55433 -Protocol TCP -Action Allow -Profile Any
}

Write-Host "Testing connectivity..." -ForegroundColor Yellow
$test = Test-NetConnection 127.0.0.1 -Port 55433
$test | Format-List ComputerName, RemoteAddress, RemotePort, TcpTestSucceeded

if ($test.TcpTestSucceeded) {
  Write-Host "`n✅ Connectivity OK to 127.0.0.1:55433" -ForegroundColor Green
} else {
  Write-Host "`n❌ Still blocked. Check AV/VPN or corporate policy for loopback restrictions." -ForegroundColor Red
}

