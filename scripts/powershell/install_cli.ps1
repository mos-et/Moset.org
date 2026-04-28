# ─── Moset CLI — Instalador en PATH ───────────────────────────
# Copia moset.exe al directorio local de herramientas y lo agrega al PATH
# Uso: .\install_cli.ps1
# ──────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# Directorio destino para el CLI
$mosetBinDir = "$env:LOCALAPPDATA\Moset\bin"
$sourceExe = "$PSScriptRoot\core-engine\target\release\moset.exe"

# Verificar que el .exe existe
if (-not (Test-Path $sourceExe)) {
    # Intentar con debug si no existe release
    $sourceExe = "$PSScriptRoot\core-engine\target\debug\moset.exe"
    if (-not (Test-Path $sourceExe)) {
        Write-Host "ERROR: No se encontro moset.exe. Compilar primero con:" -ForegroundColor Red
        Write-Host "  cargo build --release -p moset" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "AVISO: Usando build de debug (mas lento). Para release:" -ForegroundColor Yellow
    Write-Host "  cargo build --release -p moset" -ForegroundColor Yellow
}

# Crear directorio si no existe
if (-not (Test-Path $mosetBinDir)) {
    New-Item -ItemType Directory -Path $mosetBinDir -Force | Out-Null
    Write-Host "Directorio creado: $mosetBinDir" -ForegroundColor Green
}

# Copiar ejecutable
Copy-Item -Path $sourceExe -Destination "$mosetBinDir\moset.exe" -Force
Write-Host "moset.exe copiado a: $mosetBinDir" -ForegroundColor Green

# Verificar si ya esta en PATH
$currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($currentPath -notlike "*$mosetBinDir*") {
    [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$mosetBinDir", "User")
    Write-Host "Agregado al PATH del usuario" -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANTE: Abre una nueva terminal para que el PATH surta efecto" -ForegroundColor Cyan
} else {
    Write-Host "Ya esta en PATH" -ForegroundColor Cyan
}

# Verificación
Write-Host ""
Write-Host "Instalacion completada. Prueba con:" -ForegroundColor Green
Write-Host "  moset --version" -ForegroundColor White
Write-Host "  moset script.et" -ForegroundColor White
