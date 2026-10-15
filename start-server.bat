@echo off
cd /d %~dp0
echo Starting TNEB Smart Transformer Digital Twin on port 4001...
set PORT=4001
call npm.cmd start
pause
