$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $PSScriptRoot
$target = "C:\xampp\htdocs\smta"

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

Copy-Item -LiteralPath (Join-Path $source "assets") -Destination (Join-Path $target "assets") -Recurse -Force

Write-Host "SMTA deployed to http://localhost/smta/"
