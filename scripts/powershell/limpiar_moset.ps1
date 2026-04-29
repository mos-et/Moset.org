# Moset Studio - RAM & Environment Deep Cleaner
# Purga de procesos de desarrollo para liberar recursos

Write-Host "--- Iniciando Operacion de Limpieza Moset ---" -ForegroundColor Cyan

$processList = @(
    "rust-analyzer",
    "language_server_windows_x64",
    "cargo",
    "rustc",
    "node",
    "vite",
    "cl",
    "link",
    "mspdbsrv",
    "moset-ide"
)

$freedCount = 0

foreach ($pName in $processList) {
    $found = Get-Process -Name $pName -ErrorAction SilentlyContinue
    if ($found) {
        Write-Host "Deteniendo $($pName)..." -ForegroundColor Yellow
        $found | Stop-Process -Force -ErrorAction SilentlyContinue
        $freedCount++
    }
}

# Limpiar terminales PowerShell huerfanas (opcionalmente peligrosas, asique filtramos por el que no somos nosotros)
$currentPid = $PID
Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $currentPid } | ForEach-Object {
    # Solo matamos si no tiene ventana visible o si es sospechoso de ser un script huerfano
    if ($_.MainWindowHandle -eq 0) {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "--- Limpieza Completada: $freedCount familias de procesos eliminadas ---" -ForegroundColor Green
Write-Host "Calculando RAM disponible..."
$mem = Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory, TotalVisibleMemorySize
$freeGB = [math]::Round($mem.FreePhysicalMemory / 1MB, 2)
Write-Host "Memoria RAM Libre: $freeGB GB" -ForegroundColor Cyan
