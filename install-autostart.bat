@echo off
rem Start JobRadar AI automatically (minimised, no browser tab) when you log in to Windows,
rem so the daily scan always runs. Run uninstall-autostart.bat to undo.
setlocal
set "APPDIR=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
(
    echo @echo off
    echo cd /d "%APPDIR%backend"
    echo start "JobRadar AI" /min .venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) > "%STARTUP%\JobRadarAI.bat"
echo Installed. JobRadar AI will start when you log in. Open http://127.0.0.1:8000 any time.
pause
