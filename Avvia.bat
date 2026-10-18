@echo off
rem Avvia D&D Campaign Studio (doppio clic). Non modifica policy di sistema: il bypass vale solo per questo processo.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1" %*
if errorlevel 1 pause
