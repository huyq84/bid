@echo off
REM Restart backend server for P17 WebSocket auto-refresh
cd /d "%~dp0backend"
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
start "Daily Report Backend" cmd /k "node server.js"
echo Backend restarted. WebSocket auto-refresh is now active.
