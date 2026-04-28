# Instalador de Acceso Directo (Modo Compilacion)
$ErrorActionPreference = "Stop"

$batchPath = "S:\Naraka Studio\Moset\moset-ecosystem\naraka-ide\run_build.bat"
$icoPath   = "$env:LOCALAPPDATA\Moset\moset.ico"
$shortcut  = "$env:USERPROFILE\Desktop\Moset IDE (Build).lnk"

Write-Host "Creando acceso directo de compilacion..."
$WShell = New-Object -ComObject WScript.Shell
$lnk    = $WShell.CreateShortcut($shortcut)
$lnk.TargetPath       = "cmd.exe"
$lnk.Arguments        = "/c `"$batchPath`""
$lnk.WorkingDirectory = Split-Path $batchPath
$lnk.IconLocation     = "$icoPath,0"
$lnk.Description      = "Compilar binarios (.EXE / .MSI) de Moset IDE"
$lnk.Save()

Write-Host "========================================="
Write-Host "  OK: Acceso 'Moset IDE (Build)' creado"
Write-Host "  Usa este para generar el instalador final"
Write-Host "========================================="
