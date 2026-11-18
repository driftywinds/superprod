# Flutter 3.50 / Android toolchain for superprod.
# Dot-source before every Flutter command:   . .\tool\env.ps1
#
# The SDKs live outside this repo (see PLAN.md § Toolchain). Per-user directories
# are redirected into .tooling/ so nothing writes to %APPDATA%, %LOCALAPPDATA%,
# %TEMP% or C:\Users\*.
$repo = Split-Path -Parent $PSScriptRoot
$flutterSdk = 'W:\repos\WBD\.tmp\flutter-sdk\flutter'
$androidSdk = 'W:\repos\librarium-android\.tooling\android-sdk'
$jdk = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'

foreach ($tool in @($flutterSdk, $androidSdk, $jdk)) {
    if (-not (Test-Path -LiteralPath $tool)) { throw "missing toolchain: $tool" }
}

$env:APPDATA = "$repo\.tooling\appdata"
$env:LOCALAPPDATA = "$repo\.tooling\localappdata"
$env:PUB_CACHE = "$repo\.tooling\pub-cache"
$env:HOME = "$repo\.tooling\home"
$env:TEMP = "$repo\.tooling\tmp"
$env:TMP = $env:TEMP
$env:ANDROID_HOME = $androidSdk
$env:ANDROID_SDK_ROOT = $androidSdk
$env:JAVA_HOME = $jdk
$env:GRADLE_USER_HOME = "$repo\.tooling\gradle"
$env:ANDROID_USER_HOME = "$repo\.tooling\android-home"
$env:JAVA_TOOL_OPTIONS = "-Duser.home=$repo\.tooling\home"
$env:FLUTTER_SUPPRESS_ANALYTICS = 'true'
$env:PATH = "$flutterSdk\bin;$env:PATH"

foreach ($dir in @($env:APPDATA, $env:LOCALAPPDATA, $env:PUB_CACHE, $env:HOME, $env:TEMP,
        $env:GRADLE_USER_HOME, $env:ANDROID_USER_HOME)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
