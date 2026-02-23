@echo off
cd /d "%~dp0frontend"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo Starting frontend dev server...
echo.

node -v
call npm run dev

if errorlevel 1 (
    echo.
    echo Frontend failed to start. See error above.
    pause
)
