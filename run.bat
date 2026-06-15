@echo off
setlocal
set "RUN_PS1=%~dp0run.ps1"

where pwsh >nul 2>nul
if %ERRORLEVEL% equ 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%RUN_PS1%" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%RUN_PS1%" %*
)

exit /b %ERRORLEVEL%
