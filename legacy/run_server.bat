@echo off
cd /d "%~dp0"
echo Starting PDF Vectorizer Server...
wsl bash run_server.sh "%~1"
pause
