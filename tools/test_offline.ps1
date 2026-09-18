param([Parameter(Mandatory=$true)][string[]]$Tests, [switch]$Rendered, [string]$Package = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$engine = 'C:/Users/lugan/OneDrive/Documentos/Sidera Code/Ferramentas Compartilhadas/Godot/4.7.1/Godot_v4.7.1-stable_win64_console.exe'
if ($env:GRUPO_RS_GODOT) { $engine = $env:GRUPO_RS_GODOT }
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('central-offline-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$envKeys = @('APPDATA','LOCALAPPDATA','GRUPO_RS_VAULT_OVERRIDE','GRUPO_RS_VAULT_PATH','GRUPO_RS_TRANSFER_MODE','GRUPO_RS_TEST_OUTPUT')
$savedEnv = @{}
foreach ($key in $envKeys) { $savedEnv[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
    $env:APPDATA = $testRoot
    $env:LOCALAPPDATA = $testRoot
    $env:GRUPO_RS_VAULT_OVERRIDE = '1'
    $env:GRUPO_RS_VAULT_PATH = Join-Path $testRoot 'isolated.vault'
    $env:GRUPO_RS_TRANSFER_MODE = ''
    $env:GRUPO_RS_TEST_OUTPUT = $testRoot
    foreach ($test in $Tests) {
        if ($test -notmatch '^tests/[A-Za-z0-9_/-]+\.gd$') { throw "Invalid test path: $test" }
        $arguments = @('--path', $projectRoot, '--script', $test)
        if ($Package) {
            # Release templates cannot execute --script. Load their embedded
            # package with the matching editor runtime for contract inspection.
            $arguments = @('--main-pack', (Resolve-Path -LiteralPath $Package).Path, '--script', (Join-Path $projectRoot $test))
        }
        if (-not $Rendered) { $arguments += '--headless' }
        $arguments += @('--', '--update-test-mode')
        if ($Package) { $arguments += '--audit-package' }
        $output = & $engine @arguments 2>&1
        $code = $LASTEXITCODE
        $output | ForEach-Object { Write-Output "$_" }
        if ($code -ne 0 -or ($output -match 'SCRIPT ERROR:|Parse Error:|ERROR:')) { throw "Test failed: $test (exit $code)" }
    }
    Write-Output "ISOLATED_TEST_OUTPUT=$testRoot"
} finally {
    foreach ($key in $envKeys) { [Environment]::SetEnvironmentVariable($key, $savedEnv[$key], 'Process') }
}
