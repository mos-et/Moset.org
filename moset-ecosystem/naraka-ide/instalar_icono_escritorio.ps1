# Moset IDE - Instalador de Icono de Escritorio
# Solucion al icono en blanco con drives VeraCrypt cifrados

$ErrorActionPreference = "Stop"

$icoOrigen  = "S:\Naraka Studio\Moset\moset-ecosystem\naraka-ide\src-tauri\icons\icon.ico"
$icoDestino = "$env:LOCALAPPDATA\Moset\moset.ico"
$exePath    = "S:\Naraka Studio\Moset\moset-ecosystem\naraka-ide\src-tauri\target\release\moset-ide.exe"
$shortcut   = "$env:USERPROFILE\Desktop\Moset IDE.lnk"

Write-Host "Copiando icono a C: (ruta estable)..."
New-Item -ItemType Directory -Path (Split-Path $icoDestino) -Force | Out-Null
Copy-Item -Path $icoOrigen -Destination $icoDestino -Force
Write-Host "OK: Icono en $icoDestino"

Write-Host "Creando acceso directo..."
$WShell = New-Object -ComObject WScript.Shell
$lnk    = $WShell.CreateShortcut($shortcut)
$lnk.TargetPath       = $exePath
$lnk.WorkingDirectory = Split-Path $exePath
$lnk.IconLocation     = "$icoDestino,0"
$lnk.Description      = "Moset IDE - Motor Soberano"
$lnk.Save()
Write-Host "OK: Acceso directo en $shortcut"

Write-Host "Limpiando cache de iconos de Windows..."
$cachePath = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
$iconCacheFiles = Get-ChildItem -Path $cachePath -Filter "iconcache*.db" -ErrorAction SilentlyContinue

Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

foreach ($f in $iconCacheFiles) {
    try { Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue } catch {}
}

Start-Process explorer
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "==================================="
Write-Host "  Moset IDE - Icono instalado OK"
Write-Host "  El .ico esta en C:, independiente"
Write-Host "  de VeraCrypt. No volvera en blanco."
Write-Host "==================================="
