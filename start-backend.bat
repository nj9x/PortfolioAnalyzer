@echo off
cd /d "%~dp0backend"

echo Starting backend server...
echo.

if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Python virtual environment not found at backend\venv
    pause
    exit /b 1
)

call venv\Scripts\activate.bat
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

if errorlevel 1 (
    echo.
    echo Backend failed to start. See error above.
    pause
)
