$ErrorActionPreference = 'Continue'
$smsNode = (Get-Command node.exe).Source
$smsScript = Join-Path $PSScriptRoot 'sms-bridge.mjs'
do {
    # No job payloads, credentials or command output are written to a log.
    & $smsNode $smsScript *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 30
} while ($true)
