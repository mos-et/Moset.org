# Lanzador Directo (Actualiza el acceso directo principal)
$ErrorActionPreference = "Stop"

$exePath   = "S:\Naraka Studio\Moset\moset-ecosystem\naraka-ide\src-tauri\target\release\moset-ide.exe"
$icoPath   = "$env:LOCALAPPDATA\Moset\moset.ico"
$shortcut  = "$env:USERPROFILE\Desktop\Moset IDE.lnk"

Write-Host "Configurando el acceso directo principal para modo Binario Directo..."

$WShell = New-Object -ComObject WScript.Shell
$lnk    = $WShell.CreateShortcut($shortcut)
$lnk.TargetPath       = $exePath
$lnk.WorkingDirectory = Split-Path $exePath
$lnk.IconLocation     = "$icoPath,0"
$lnk.Description      = "Ejecutar la ultima compilacion de Moset IDE"
$lnk.Save()

Write-Host "========================================="
Write-Host "  OK: Acceso 'Moset IDE' actualizado"
Write-Host "  Ahora este icono SIEMPRE correra lo"
Write-Host "  ultimo que hayas compilado con 'Build'."
Write-Host "========================================="
