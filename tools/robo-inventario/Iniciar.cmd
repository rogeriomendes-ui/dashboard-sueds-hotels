@echo off
cd /d "%~dp0"
if not exist node_modules\playwright-core\package.json (
  call npm.cmd ci --omit=dev --ignore-scripts
  if errorlevel 1 exit /b 1
)
node worker.mjs
