#!/bin/bash
cd /d/hyq/cjs/zb/daily-report-system/backend
node server.js &
SERVER_PID=$!
sleep 3
curl -s http://localhost:3010/api/models/custom
kill $SERVER_PID 2>/dev/null
