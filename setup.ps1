# ASTRA-HEALTH one-command setup for Windows (PowerShell).  Usage:  .\setup.ps1          (NVIDIA GPU, CUDA 12.1 wheels)
#                                                                     .\setup.ps1 -Cpu     (no NVIDIA GPU)
param([switch]$Cpu, [switch]$NoData)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$py = $null
foreach ($v in "3.11", "3.10", "3.9") { try { & py "-$v" -c "import sys" 2>$null; if ($LASTEXITCODE -eq 0) { $py = $v; break } } catch {} }
if (-not $py) { throw "Python 3.9-3.11 not found. Install it from python.org (tick 'py launcher')." }
Write-Host "== Python $py virtual environment (.venv)"
if (-not (Test-Path .venv)) { & py "-$py" -m venv .venv }
$vpy = ".\.venv\Scripts\python.exe"
& $vpy -m pip install --upgrade pip==24.2 -q
$idx = if ($Cpu) { "https://download.pytorch.org/whl/cpu" } else { "https://download.pytorch.org/whl/cu121" }
Write-Host "== PyTorch 2.2.2 from $idx"
& $vpy -m pip install torch==2.2.2 --index-url $idx -q
Write-Host "== Python requirements"
& $vpy -m pip install -r requirements.txt -q
& $vpy -m ipykernel install --user --name astra-health --display-name "ASTRA-HEALTH (.venv)"

if (-not $NoData) { Write-Host "== Datasets (~2.6 GB, resumable)"; & $vpy scripts\download_data.py }

if (Get-Command npm -ErrorAction SilentlyContinue) {
  Write-Host "== Web dashboard dependencies"; Push-Location apps\web; npm ci --silent; Pop-Location
} else { Write-Warning "Node.js 20+ not found: install it to run the dashboard (apps\web)." }

Write-Host "`nSetup complete. Next:"
Write-Host "  .\.venv\Scripts\python.exe scripts\run_pipeline.py --smoke   # 3-minute check"
Write-Host "  .\.venv\Scripts\python.exe scripts\run_pipeline.py           # full training"
Write-Host "  cd apps\web; npm run dev                                     # dashboard"
