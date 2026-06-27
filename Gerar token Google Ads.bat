@echo off
setlocal

cd /d "%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  echo Node do Codex nao encontrado em:
  echo %NODE_EXE%
  echo.
  echo Abra o Codex novamente ou rode o script manualmente com um Node instalado.
  pause
  exit /b 1
)

"%NODE_EXE%" tools\google_ads_oauth_token.js

echo.
pause
