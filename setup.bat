@echo off
echo OpenClaw Dashboard Setup
echo ========================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Download from: https://nodejs.org
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

echo Installing...
npm install

echo.
echo Starting dashboard on http://localhost:3080
echo Press Ctrl+C to stop
echo.

node index.js
