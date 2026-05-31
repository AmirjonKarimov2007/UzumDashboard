@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  Uzum Dashboard - Holat tekshirish
REM ═══════════════════════════════════════════════════════════════════════

echo.
echo === Port holati ===
echo.
echo Port 3001 (Backend):
netstat -ano | findstr ":3001 " | findstr LISTENING || echo   YO'Q - ishga tushmagan
echo.
echo Port 3002 (Frontend):
netstat -ano | findstr ":3002 " | findstr LISTENING || echo   YO'Q - ishga tushmagan
echo.

echo === Tezkor test ===
curl -s -o nul -w "Backend (3001):  HTTP %%{http_code}\n" -X POST http://localhost:3001/auth/send-otp -H "Content-Type: application/json" -d "{\"phone\":\"+998917500567\"}" 2>nul
curl -s -o nul -w "Frontend (3002): HTTP %%{http_code}\n" http://localhost:3002/ 2>nul

echo.
echo Boshqarish:
echo   start.bat   - Ishga tushirish
echo   stop.bat    - To'xtatish
echo   restart.bat - Qayta ishga tushirish
echo.
pause
