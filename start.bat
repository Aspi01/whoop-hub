@echo off
chcp 65001 > nul
title Whoop Hub AI (Mobile & Desktop)
echo ========================================================
echo        🚀 ЗАПУСК WHOOP HUB AI (С доступом для телефона)
echo ========================================================
echo.
echo Запускаем сервер, клиент и защищенный HTTPS-туннель для смартфона...
echo Ссылка для телефона появится ниже в строке: https://...trycloudflare.com
echo.
npm run tunnel
pause
