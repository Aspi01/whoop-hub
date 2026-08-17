@echo off
chcp 65001 > nul
title Whoop Hub AI (Mobile & Desktop)
echo ========================================================
echo        🚀 ЗАПУСК WHOOP HUB AI (Zero-Setup)
echo ========================================================
echo.
echo [1/2] Запуск сервера и туннеля для смартфона...
echo [2/2] Ссылка для телефона появится ниже в строке: your url is: https://...loca.lt
echo.
start http://localhost:3001
npm run tunnel
pause
