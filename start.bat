@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM  Uzum Dashboard - Ishga tushirish skripti
REM
REM  Bu skript ikkita servis (backend va frontend) ni o'z konsol oynalarida
REM  ochib turadi. Servislar o'z oynasida ko'rinib turadi, agar yopilmasa
REM  doimiy ishlaydi. Bu yerdagi cmd oynani yopsangiz ham servislar ishlaydi.
REM ═══════════════════════════════════════════════════════════════════════

cd /d "%~dp0"

echo.
echo === Uzum Dashboard ishga tushirilmoqda ===
echo.

REM Eski jarayonlarni o'chiramiz (toza boshlash)
echo Eski jarayonlarni tozalanmoqda (port 3001, 3002)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3002 " ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Auth backend — alohida oynada
echo Backend (port 3001) ishga tushirilmoqda...
start "Uzum Auth (port 3001)" cmd /k "cd /d %~dp0services\auth && echo === UZUM AUTH BACKEND === && npm run start:dev"

REM Kichik kutish, keyin web
timeout /t 3 /nobreak >nul

REM Web frontend — alohida oynada
echo Frontend (port 3002) ishga tushirilmoqda...
start "Uzum Web (port 3002)" cmd /k "cd /d %~dp0web && echo === UZUM WEB FRONTEND === && npm run dev"

echo.
echo ═══════════════════════════════════════════════════════════════════════
echo  Tayyor! Ikkita yangi cmd oyna ochildi.
echo.
echo  Backend:  http://localhost:3001
echo  Frontend: http://localhost:3002  (login uchun shu yerga kiring)
echo.
echo  MUHIM:
echo   - Ochilgan ikki cmd oynani YOPMANG. Yopsangiz servis ham to'xtaydi.
echo   - Bu oyna (start.bat) ni yopsangiz problema yo'q.
echo   - To'xtatish uchun: stop.bat
echo ═══════════════════════════════════════════════════════════════════════
echo.

REM Kichik kutish — Next.js compile bo'lishi uchun
echo Servislar yuklanmoqda, 15 sekund kuting...
timeout /t 15 /nobreak >nul

echo.
echo Port holati:
netstat -ano | findstr ":3001 :3002" | findstr LISTENING
echo.
pause
