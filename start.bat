@echo off
rem JobRadar AI - one-click start for Windows. First run installs everything (needs Python 3.11+ and Node 18+).
setlocal
cd /d "%~dp0"

if not exist backend\.venv (
    echo [setup] Creating Python environment...
    python -m venv backend\.venv || goto :error
    backend\.venv\Scripts\python -m pip install --upgrade pip -q
    backend\.venv\Scripts\python -m pip install -r backend\requirements.txt -q || goto :error
)

if not exist backend\.env (
    copy backend\.env.example backend\.env >nul
    echo [setup] Created backend\.env - add your OPENAI_API_KEY there for AI features.
)

if not exist frontend\dist\index.html (
    echo [setup] Building the web interface...
    pushd frontend
    call npm install --no-audit --no-fund || goto :error
    call npm run build || goto :error
    popd
)

echo.
echo  JobRadar AI is starting at http://127.0.0.1:8000
echo  Keep this window open - daily scans run while the app is running.
echo.
start "" http://127.0.0.1:8000
cd backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
goto :eof

:error
echo.
echo Setup failed. See the messages above.
pause
exit /b 1
