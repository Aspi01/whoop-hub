@echo off
chcp 65001 > nul
title Whoop Hub AI
echo ========================================================
echo        🚀 ЗАПУСК WHOOP HUB AI (Zero-Setup)
echo ========================================================
echo.
echo [1/2] Запуск сервера и мобильного приложения...
start http://localhost:5173
npm run dev
pause
