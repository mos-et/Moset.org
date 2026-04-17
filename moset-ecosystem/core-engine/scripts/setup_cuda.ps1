# ==============================================================================
# MOSET — Setup CUDA Toolkit para RTX 5070/5080/5090 (Blackwell)
# ==============================================================================
# Ejecutar: .\scripts\setup_cuda.ps1
# Requiere: NVIDIA Driver 577+ (verificar con nvidia-smi)
# ==============================================================================

Write-Host ""
Write-Host "  =============================================" -ForegroundColor DarkYellow
Write-Host "  MOSET — Verificacion CUDA para Motor Mythos" -ForegroundColor DarkYellow
Write-Host "  =============================================" -ForegroundColor DarkYellow
Write-Host ""

# 1. Verificar nvidia-smi
Write-Host "  [1/4] Verificando driver NVIDIA..." -ForegroundColor Cyan
$smi = nvidia-smi 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ nvidia-smi no encontrado. Instala el driver NVIDIA primero." -ForegroundColor Red
    Write-Host "    https://www.nvidia.com/download/index.aspx" -ForegroundColor Gray
    exit 1
}
$driverLine = $smi | Select-String "Driver Version"
Write-Host "  ✓ $($driverLine.ToString().Trim())" -ForegroundColor Green

# 2. Verificar GPU
Write-Host ""
Write-Host "  [2/4] Detectando GPU..." -ForegroundColor Cyan
$gpuLine = $smi | Select-String "GeForce|RTX|Quadro|Tesla"
if ($gpuLine) {
    Write-Host "  ✓ GPU: $($gpuLine.ToString().Trim())" -ForegroundColor Green
} else {
    Write-Host "  ⚠ No se detectó GPU NVIDIA compatible" -ForegroundColor Yellow
}

# 3. Verificar nvcc (CUDA Toolkit)
Write-Host ""
Write-Host "  [3/4] Verificando CUDA Toolkit (nvcc)..." -ForegroundColor Cyan
$nvcc = Get-Command nvcc -ErrorAction SilentlyContinue
if ($nvcc) {
    $nvccVer = nvcc --version 2>&1 | Select-String "release"
    Write-Host "  ✓ nvcc encontrado: $($nvccVer.ToString().Trim())" -ForegroundColor Green
    Write-Host ""
    Write-Host "  [4/4] Todo listo. Compilar con CUDA:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "    cargo build --release --features `"ai,cuda`"" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "  ✗ nvcc NO encontrado — CUDA Toolkit no instalado" -ForegroundColor Red
    Write-Host ""
    Write-Host "  [4/4] Instrucciones de instalacion:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Descargar CUDA Toolkit 12.x (compatible con tu driver):" -ForegroundColor White
    Write-Host "     https://developer.nvidia.com/cuda-12-6-0-download-archive" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Durante la instalacion, seleccionar:" -ForegroundColor White
    Write-Host "     - CUDA Development (nvcc, headers)" -ForegroundColor Gray
    Write-Host "     - CUDA Runtime" -ForegroundColor Gray
    Write-Host "     - cuBLAS (requerido por Candle)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. Verificar que nvcc esta en PATH:" -ForegroundColor White
    Write-Host "     nvcc --version" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  4. Compilar Moset con CUDA:" -ForegroundColor White
    Write-Host "     cargo build --release --features `"ai,cuda`"" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Nota: El motor Mythos detectara CUDA automaticamente" -ForegroundColor Gray
    Write-Host "  y movera los tensores a la VRAM de la RTX." -ForegroundColor Gray
    Write-Host ""
}
