@echo off
title Generador de Instaladores Moset (Multi-OS)
color 0B
echo.
echo ==============================================================
echo      NARAKA STUDIO - CONSTRUCTOR DE INSTALADORES MOSET
echo ==============================================================
echo.

set IDE_PATH=s:\Naraka Studio\Moset\moset-ecosystem\naraka-ide
set REPO_PATH=s:\Naraka Studio\Moset
set OUT_DIR=s:\Naraka Studio\Moset\Instaladores

echo [*] Preparando entorno...
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

echo ==============================================================
echo 1) ORQUESTAR COMPILACION MULTI-OS EN LA NUBE (Mac, Linux, Win)
echo ==============================================================
echo [*] Etiquetando version en Git para disparar GitHub Actions...
cd /d "%REPO_PATH%"
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TAG_NAME=v1.0.%datetime:~2,6%-%datetime:~8,4%
git tag %TAG_NAME%
git push origin %TAG_NAME%
echo [+] Tag %TAG_NAME% enviado. GitHub Actions esta compilando los binarios Mac (.dmg) y Linux (.AppImage).
echo [+] Los podras descargar desde: https://github.com/narakastudio/moset/releases/latest
echo.

echo ==============================================================
echo 2) COMPILACION LOCAL (Solamente Windows x64)
echo ==============================================================
echo [*] Moviendose al directorio principal del IDE...
cd /d "%IDE_PATH%"

echo [*] Invocando Tauri Build local para Windows...
call npm run tauri build

echo [*] Construccion local terminada. Moviendo binarios NSIS y MSI a la carpeta de Instaladores...
copy /Y "src-tauri\target\release\bundle\nsis\*.exe" "%OUT_DIR%\"
copy /Y "src-tauri\target\release\bundle\msi\*.msi" "%OUT_DIR%\"

echo ==============================================================
echo [*] Instaladores de Windows locales creados en: %OUT_DIR%
echo [*] RECUERDA: macOS y Linux se compilan solos en la nube. 
echo ==============================================================
echo.
pause
