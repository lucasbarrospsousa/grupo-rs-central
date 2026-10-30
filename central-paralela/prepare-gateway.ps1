$ErrorActionPreference='Stop'
# Source-only variant. Never installs an APK or touches the operational phone.
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$source=Join-Path $workspace 'RS SMS Gateway'
$target=Join-Path $PSScriptRoot '../.secrets/homologacao/gateway-drive-build'
$target=[IO.Path]::GetFullPath($target)
New-Item -ItemType Directory -Path (Join-Path $target 'app') -Force | Out-Null
foreach($file in @('settings.gradle','build.gradle','gradle.properties')){Copy-Item -LiteralPath (Join-Path $source $file) -Destination $target}
Copy-Item -LiteralPath (Join-Path $source 'app/build.gradle') -Destination (Join-Path $target 'app/build.gradle')
Copy-Item -LiteralPath (Join-Path $source 'app/src') -Destination (Join-Path $target 'app') -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'clients/CloudGateway.kt') -Destination (Join-Path $target 'app/src/main/java/br/com/sideracode/smsgateway/CloudGateway.kt')
$gradle=Join-Path $target 'app/build.gradle'
$body=[IO.File]::ReadAllText($gradle).Replace('versionCode 5','versionCode 7').Replace("versionName '0.5.0'","versionName '0.5.2-drive'")
[IO.File]::WriteAllText($gradle,$body)
Push-Location $target
try { & (Join-Path $source 'tools/build.ps1') -Task assembleDebug; if($LASTEXITCODE -ne 0){throw 'Build failed'} }
finally { Pop-Location }
Get-FileHash -LiteralPath (Join-Path $target 'app/build/outputs/apk/debug/app-debug.apk') -Algorithm SHA256
