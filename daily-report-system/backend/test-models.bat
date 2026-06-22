@echo off
start /B "" node server.js
timeout /t 2 >nul
curl -s http://localhost:3010/api/models/custom
