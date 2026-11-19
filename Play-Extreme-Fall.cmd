@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to start the local game server.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Production files are missing. Run npm install and npm run build.
  pause
  exit /b 1
)
node scripts\serve.mjs --open
pause

