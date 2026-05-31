@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  Uzum Dashboard - Servislarni to'xtatish
REM  Port 3001 va 3002 dagi har qanday jarayonni o'chiradi.
REM ═══════════════════════════════════════════════════════════════════════

echo Servislar to'xtatilmoqda...
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr LISTENING 2^>nul') do (
    echo Backend PID %%a to'xtatilyapti...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002 " ^| findstr LISTENING 2^>nul') do (
    echo Frontend PID %%a to'xtatilyapti...
    taskkill /F /PID %%a >nul 2>&1
    set FOUND=1
)

if %FOUND%==0 (
    echo Hech qanday servis ishlamayapdi.
) else (
    echo.
    echo Servislar to'xtatildi.
)

echo.
echo Qayta ishga tushirish: start.bat
pause
