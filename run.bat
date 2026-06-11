@echo off
REM Thin wrapper. Prefer pwsh run.ps1 -Task <name>
pwsh -File "%~dp0run.ps1" %*
if %ERRORLEVEL% neq 0 exit /b %ERRORLEVEL%
