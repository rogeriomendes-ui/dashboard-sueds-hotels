@echo off
setlocal

set "ROOT=%~dp0"
set "NODE=C:\Users\roger\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE%" (
  echo Node do Codex nao encontrado:
  echo %NODE%
  pause
  exit /b 1
)

if "%~1"=="" (
  for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "Get-ChildItem -Path \"$env:USERPROFILE\Downloads\" -Filter 'reservas-perdidas*.xlsx' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName"`) do set "INPUT=%%F"
) else (
  set "INPUT=%~1"
)

if "%INPUT%"=="" (
  echo Nenhum arquivo reservas-perdidas*.xlsx encontrado em Downloads.
  echo Baixe o arquivo da Niara e tente novamente.
  pause
  exit /b 1
)

echo.
echo Arquivo selecionado:
echo %INPUT%
echo.
echo Simulando importacao...
echo.
"%NODE%" "%ROOT%tools\import_niara_carrinhos_google.js" "%INPUT%"
if errorlevel 1 (
  echo.
  echo A simulacao falhou. Nada foi gravado.
  pause
  exit /b 1
)

echo.
choice /C SN /M "Aplicar esta importacao no Google Sheets"
if errorlevel 2 (
  echo Importacao cancelada.
  pause
  exit /b 0
)

echo.
echo Aplicando importacao...
echo.
"%NODE%" "%ROOT%tools\import_niara_carrinhos_google.js" "%INPUT%" --apply
if errorlevel 1 (
  echo.
  echo A importacao falhou.
  pause
  exit /b 1
)

echo.
echo Importacao concluida.
pause
