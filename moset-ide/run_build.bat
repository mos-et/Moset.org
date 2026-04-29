@echo off
title Moset IDE - Compilador de Produccion
setlocal
cd /d "S:\Naraka Studio\Moset\moset-ide"

echo [SISTEMA] Iniciando sistema de compilacion optimizado...
echo.

:: 1. Limpieza de instaladores viejos (bundle)
if exist "src-tauri\target\release\bundle" (
    echo [LIMPIEZA] Eliminando instalaciones previas para ahorrar espacio...
    rd /s /q "src-tauri\target\release\bundle"
)

:: 2. Opcion de Limpieza Profunda (Cargo Clean)
set /p deepclean="¿Deseas realizar una LIMPIEZA PROFUNDA (borrar cache de Rust)? [S/N]: "
if /i "%deepclean%"=="S" (
    echo [PELIGRO] Limpiando toda la cache de compilacion ^(esto tomara tiempo^)...
    pushd src-tauri
    call cargo clean
    popd
    echo [OK] Cache vaciada.
)

echo.
echo [SISTEMA] Iniciando compilacion de binarios (Release)...
echo [INFO] Esto generara el .exe y el .msi final.
call npm run tauri build
echo.
echo [OK] Compilacion finalizada.
echo [Ruta] src-tauri\target\release\bundle\msi\
pause
