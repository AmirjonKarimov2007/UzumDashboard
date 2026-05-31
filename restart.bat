@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  Uzum Dashboard - Qayta ishga tushirish (stop + start)
REM ═══════════════════════════════════════════════════════════════════════

cd /d "%~dp0"
call stop.bat
timeout /t 2 /nobreak >nul
call start.bat
