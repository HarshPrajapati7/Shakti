# Build the Sakti desktop app (Windows).  .\build-app.ps1
# Output: <build dir>\release\sakti.exe and an installer in <build dir>\release\bundle\nsis
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
# windres (needed to embed the app icon) cannot handle spaces in paths, so build outside the repo if it has one
$env:CARGO_TARGET_DIR = if ($PSScriptRoot -match " ") { Join-Path $env:LOCALAPPDATA "sakti-build" } else { Join-Path $PSScriptRoot "engine\target" }
Push-Location apps\web
if (-not (Test-Path node_modules)) { npm ci }
npm run build
npx tauri build --config ..\..\engine\sakti-app\tauri.conf.json 2>$null
if ($LASTEXITCODE -ne 0) { Pop-Location; Push-Location engine; cargo build -p sakti-app --release; Pop-Location } else { Pop-Location }
Write-Host "Sakti built: $env:CARGO_TARGET_DIR\release\sakti.exe"
