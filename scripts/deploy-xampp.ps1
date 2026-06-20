$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $PSScriptRoot
$target = "C:\xampp\htdocs\threadsme"
$extensionSource = Join-Path $source "threadsme-extension"
$extensionZip = Join-Path $source "assets\threadsme-extension.zip"

New-Item -ItemType Directory -Force -Path $target | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $extensionZip) | Out-Null

if (Test-Path $extensionSource) {
  if (Test-Path $extensionZip) {
    Remove-Item -LiteralPath $extensionZip -Force
  }
  $extensionItems = @(
    (Join-Path $extensionSource "manifest.json"),
    (Join-Path $extensionSource "README.md"),
    (Join-Path $extensionSource "src")
  )
  Compress-Archive -Path $extensionItems -DestinationPath $extensionZip -Force
  Write-Host "ThreadsMe extension package rebuilt."
}

$staticItems = @(
  "index.html",
  "styles.css",
  "config.js",
  "app.js"
)

foreach ($item in $staticItems) {
  Copy-Item -LiteralPath (Join-Path $source $item) -Destination (Join-Path $target $item) -Force
}

$runtimeFiles = @(
  @{
    Runtime = "work\runtime\status.json"
    Legacy = "status.json"
    Target = "status.json"
  },
  @{
    Runtime = "work\runtime\story-runs.json"
    Legacy = "story-runs.json"
    Target = "story-runs.json"
  },
  @{
    Runtime = "work\runtime\threads-schedule.json"
    Legacy = "threads_flexi_marble_schedule.json"
    Target = "threads_flexi_marble_schedule.json"
  }
)

foreach ($file in $runtimeFiles) {
  $runtimePath = Join-Path $source $file.Runtime
  $legacyPath = Join-Path $source $file.Legacy
  $sourcePath = if (Test-Path $runtimePath) { $runtimePath } else { $legacyPath }
  if (Test-Path $sourcePath) {
    Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $target $file.Target) -Force
  }
}

$targetAssets = Join-Path $target "assets"
New-Item -ItemType Directory -Force -Path $targetAssets | Out-Null
Copy-Item -Path (Join-Path $source "assets\*") -Destination $targetAssets -Recurse -Force

Write-Host "ThreadsMe deployed to http://localhost/threadsme/"
