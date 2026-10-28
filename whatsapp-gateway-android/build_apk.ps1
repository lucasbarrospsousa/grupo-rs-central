$ErrorActionPreference = "Stop"

$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$buildTools = "$sdk\build-tools\35.0.0"
$platform = "$sdk\platforms\android-34"
if (-not (Test-Path $platform)) {
    $platform = "$sdk\platforms\android-35"
}
$androidJar = "$platform\android.jar"
$aapt2 = "$buildTools\aapt2.exe"
$d8 = "$buildTools\d8.bat"
$zipalign = "$buildTools\zipalign.exe"
$apksigner = "$buildTools\apksigner.bat"
$javac = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\javac.exe"

$projDir = $PSScriptRoot
$resDir = "$projDir\res"
$manifest = "$projDir\AndroidManifest.xml"
$buildDir = "$projDir\build"
$genDir = "$buildDir\gen"
$classesDir = "$buildDir\classes"
$compiledRes = "$buildDir\compiled_res"

Write-Host "Iniciando compilação do RS Gateway Mobile APK..."

# Clean build dir
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $buildDir, $genDir, $classesDir, $compiledRes | Out-Null

# 1. Compile resources with aapt2
Write-Host "1. Compilando recursos com aapt2..."
& $aapt2 compile --dir $resDir -o "$compiledRes\res.zip"

# 2. Link resources and generate R.java
Write-Host "2. Vinculando recursos e gerando R.java..."
& $aapt2 link -I $androidJar `
    --manifest $manifest `
    --java $genDir `
    -o "$buildDir\unaligned.apk" `
    --auto-add-overlay `
    "$compiledRes\res.zip"

# 3. Compile Java sources
Write-Host "3. Compilando fontes Java..."
$javaFiles = Get-ChildItem -Path "$projDir\src", "$genDir" -Filter "*.java" -Recurse | ForEach-Object { "`"$($_.FullName)`"" }
& $javac -encoding UTF-8 -cp "`"$androidJar`"" -d "`"$classesDir`"" -source 1.8 -target 1.8 ($javaFiles -replace '"', '')

# 4. Convert classes to dex with d8
Write-Host "4. Gerando classes.dex com d8..."
$classFiles = Get-ChildItem -Path $classesDir -Filter "*.class" -Recurse | ForEach-Object { $_.FullName }
$d8Jar = "$buildTools\lib\d8.jar"
$javaExe = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\java.exe"
& $javaExe -cp $d8Jar com.android.tools.r8.D8 --lib $androidJar --output $buildDir $classFiles

# 5. Add classes.dex into unaligned APK
Write-Host "5. Inserindo classes.dex no APK..."
$dexFile = "$buildDir\classes.dex"
if (-not (Test-Path $dexFile)) { throw "classes.dex não foi gerado!" }
Push-Location $buildDir
& "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\jar.exe" -uf "$buildDir\unaligned.apk" classes.dex
Pop-Location

# 6. Zipalign
Write-Host "6. Alinhando APK com zipalign..."
$alignedApk = "$buildDir\rs-gateway-aligned.apk"
& $zipalign -f 4 "$buildDir\unaligned.apk" $alignedApk

# 7. Sign APK with debug keystore
Write-Host "7. Assinando APK com debug.keystore..."
$finalApk = "$projDir\rs-gateway-mobile.apk"
$keystore = "$env:USERPROFILE\.android\debug.keystore"

& cmd.exe /c "$apksigner sign --ks `"$keystore`" --ks-pass pass:android --key-pass pass:android --out `"$finalApk`" `"$alignedApk`""

Write-Host "APK gerado com sucesso em: $finalApk"
Get-Item $finalApk | Select-Object Name, Length
