@echo off
title Moset IDE - Modo Desarrollo
cd /d "S:\Naraka Studio\Moset\moset-ide"
echo [SISTEMA] Iniciando Moset IDE en modo caliente (Hot Reload)...
call npm run tauri dev
pause
