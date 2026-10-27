param([Parameter(Mandatory=$true)][string]$TokenFile,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$source=Join-Path $workspace 'Configurador RS300'
$godot=Join-Path $workspace 'Ferramentas Compartilhadas/Godot/4.7.1/Godot_v4.7.1-stable_win64_console.exe'
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
$TokenFile=(Resolve-Path -LiteralPath $TokenFile).Path
$stage=Join-Path $OutputDirectory 'stage'
if(Test-Path -LiteralPath $stage){throw 'Use uma pasta nova.'}
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach($folder in @('src','assets')){Copy-Item -LiteralPath (Join-Path $source $folder) -Destination $stage -Recurse}
foreach($file in @('project.godot','export_presets.cfg')){Copy-Item -LiteralPath (Join-Path $source $file) -Destination $stage}
New-Item -ItemType Directory -Path (Join-Path $stage 'tools'),(Join-Path $stage 'portable_private') | Out-Null
foreach($file in @('serial_bridge.py','central_db_bridge.py','araguaina_web_bridge.py','show_windows_notification.ps1')){Copy-Item -LiteralPath (Join-Path $source "tools/$file") -Destination (Join-Path $stage 'tools')}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'clients/central_online_service.gd') -Destination (Join-Path $stage 'src/services/central_online_service.gd') -Force
$project=Get-Content -LiteralPath (Join-Path $stage 'project.godot') -Raw
$project=$project -replace 'config/name="[^"]+"','config/name="Configurador RS300 Drive"'
Set-Content -LiteralPath (Join-Path $stage 'project.godot') -Value $project -Encoding utf8
$provision=Join-Path $stage 'src/services/provisioning_service.gd'
$content=Get-Content -LiteralPath $provision -Raw
$content=$content.Replace('.path_join("Configurador RS300")','.path_join("Configurador RS300 Drive")')
Set-Content -LiteralPath $provision -Value $content -Encoding utf8
$preset=Get-Content -LiteralPath (Join-Path $stage 'export_presets.cfg') -Raw
Set-Content -LiteralPath (Join-Path $stage 'export_presets.cfg') -Value $preset.Replace('include_filter="','include_filter="portable_private/*,') -Encoding utf8
& $godot --headless --path $source --script (Join-Path $PSScriptRoot 'clients/prepare-drive-profile.gd') -- (Join-Path $stage 'portable_private') $TokenFile
if($LASTEXITCODE){throw 'Falha nos perfis independentes.'}
& 'C:/GRUPO RS CENTRAL/runtime/python/python.exe' (Join-Path $source 'tools/package_portable_runtime.py') 'C:/GRUPO RS CENTRAL/runtime/python' (Join-Path $source 'tools/vendor') (Join-Path $stage 'portable_private/runtime.zip')
if($LASTEXITCODE){throw 'Falha no runtime.'}
& $godot --headless --path $stage --editor --import
if($LASTEXITCODE){throw 'Falha na importação.'}
$exe=Join-Path $OutputDirectory 'Configurador RS300 - Drive.exe'
& $godot --headless --path $stage --export-release 'Windows Desktop' $exe
if($LASTEXITCODE -or !(Test-Path -LiteralPath $exe)){throw 'Falha no executável.'}
Get-FileHash -LiteralPath $exe -Algorithm SHA256
