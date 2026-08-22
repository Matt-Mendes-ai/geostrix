@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  GeoStrix Python sidecar setup
echo ============================================================
echo.
echo This will:
echo   1. Check for Python 3.11 (via the "py" launcher)
echo   2. Create an isolated virtual environment in this folder
echo   3. Install fastapi/uvicorn/numpy/scipy/gempy into it
echo   4. Point GeoStrix at this environment (GEOSTRIX_PYTHON)
echo.

py -3.11 --version >nul 2>&1
if errorlevel 1 (
    echo [X] Python 3.11 was not found via the "py" launcher.
    echo.
    echo     Please install it first from:
    echo     https://www.python.org/downloads/release/python-3119/
    echo     ^(the "Windows installer ^(64-bit^)" link^)
    echo.
    echo     You don't need to check "Add to PATH" - just install it,
    echo     then run this script again.
    echo.
    pause
    exit /b 1
)

echo [OK] Found:
py -3.11 --version
echo.

if not exist "%~dp0venv" (
    echo Creating virtual environment in .\venv ...
    py -3.11 -m venv "%~dp0venv"
    if errorlevel 1 (
        echo [X] Failed to create the virtual environment.
        pause
        exit /b 1
    )
) else (
    echo [OK] Virtual environment already exists, reusing it.
)
echo.

echo Installing dependencies ^(this pulls in gempy - may take a few minutes^)...
"%~dp0venv\Scripts\python.exe" -m pip install --upgrade pip >nul
"%~dp0venv\Scripts\python.exe" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [X] pip install failed - see the error above.
    pause
    exit /b 1
)
echo.
echo [OK] Dependencies installed.
echo.

echo Verifying the sidecar starts and responds...
start "GeoStrix sidecar (verify)" /min "%~dp0venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8765
cd /d "%~dp0"
timeout /t 4 /nobreak >nul
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri http://127.0.0.1:8765/health -TimeoutSec 5; Write-Host '[OK] Sidecar responded:' $r; exit 0 } catch { Write-Host '[X] Sidecar did not respond - check the sidecar window that opened for errors.'; exit 1 }"
set VERIFY_RESULT=%errorlevel%
taskkill /FI "WINDOWTITLE eq GeoStrix sidecar (verify)*" /T /F >nul 2>&1
echo.

echo Setting GEOSTRIX_PYTHON so GeoStrix uses this environment...
setx GEOSTRIX_PYTHON "%~dp0venv\Scripts\python.exe" >nul
echo [OK] GEOSTRIX_PYTHON set to: %~dp0venv\Scripts\python.exe
echo.

echo ============================================================
if "%VERIFY_RESULT%"=="0" (
    echo  Setup complete and verified.
) else (
    echo  Setup finished, but verification failed - see above.
)
echo.
echo  IMPORTANT: close and reopen any terminal / the GeoStrix app
echo  so it picks up the new GEOSTRIX_PYTHON setting, then launch
echo  GeoStrix and check the "Py" indicator in the status bar.
echo ============================================================
pause
