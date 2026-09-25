param([switch]$CheckRuntime)
$ErrorActionPreference = 'Stop'
$smsBundledNode = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$smsNode = if (Test-Path -LiteralPath $smsBundledNode) { $smsBundledNode } else { (Get-Command node.exe -ErrorAction Stop).Source }
if ($CheckRuntime) { & $smsNode --version; exit $LASTEXITCODE }
$smsScript = Join-Path $PSScriptRoot 'sms-bridge.mjs'
$smsMutex = New-Object System.Threading.Mutex($false, 'Local\GrupoRSCentralSmsSupervisor')
try { $smsOwned = $smsMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $smsOwned = $true }
if (-not $smsOwned) { $smsMutex.Dispose(); exit 0 }
try { do {
    # No job payloads, credentials or command output are written to a log.
    try { & $smsNode $smsScript *> $null; $smsExit = $LASTEXITCODE } catch { $smsExit = 1 }
    if ($smsExit -eq 0 -or $smsExit -eq 78) { break }
    Start-Sleep -Seconds 30
} while ($true) } finally { $smsMutex.ReleaseMutex(); $smsMutex.Dispose() }
