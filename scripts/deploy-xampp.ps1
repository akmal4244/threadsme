$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $PSScriptRoot
$target = "C:\xampp\htdocs\threadsme"

New-Item -ItemType Directory -Force -Path $target | Out-Null

$items = @(
  "index.html",
  "styles.css",
  "app.js",
  "status.json",
  "story-runs.json",
  "threads_flexi_marble_schedule.json"
)

foreach ($item in $items) {
  Copy-Item -LiteralPath (Join-Path $source $item) -Destination (Join-Path $target $item) -Force
}

$targetAssets = Join-Path $target "assets"
New-Item -ItemType Directory -Force -Path $targetAssets | Out-Null
Copy-Item -Path (Join-Path $source "assets\*") -Destination $targetAssets -Recurse -Force

Write-Host "ThreadsMe deployed to http://localhost/threadsme/"
