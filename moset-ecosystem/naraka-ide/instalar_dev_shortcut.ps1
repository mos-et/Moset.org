# Instalador de Acceso Directo (Modo Desarrollo)
$ErrorActionPreference = "Stop"

$batchPath = "S:\Naraka Studio\Moset\moset-ecosystem\naraka-ide\run_dev.bat"
$icoPath   = "$env:LOCALAPPDATA\Moset\moset.ico"
$shortcut  = "$env:USERPROFILE\Desktop\Moset IDE (Dev).lnk"

Write-Host "Creando acceso directo de desarrollo..."
$WShell = New-Object -ComObject WScript.Shell
$lnk    = $WShell.CreateShortcut($shortcut)
$lnk.TargetPath       = "cmd.exe"
$lnk.Arguments        = "/c `"$batchPath`""
$lnk.WorkingDirectory = Split-Path $batchPath
$lnk.IconLocation     = "$icoPath,0"
$lnk.Description      = "Lanzar Moset IDE en modo Hot-Reload"
$lnk.Save()

Write-Host "======================================="
Write-Host "  OK: Acceso 'Moset IDE (Dev)' creado"
Write-Host "  Usa este para ver cambios al instante"
Write-Host "======================================="
