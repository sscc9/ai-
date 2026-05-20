@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: Navigate to server directory relative to this script
cd /d "%~dp0server"

echo Checking Python installation...
set "PYTHON_CMD="

:: 1. Search for python in PATH, ignoring WindowsApps dummy alias
for /f "delims=" %%i in ('where python 2^>nul') do (
    set "filePath=%%i"
    set "filteredPath=!filePath:WindowsApps=!"
    if "!filePath!"=="!filteredPath!" (
        set "PYTHON_CMD=%%i"
        goto :python_found
    )
)

:: 2. Search for python3 in PATH, ignoring WindowsApps dummy alias
for /f "delims=" %%i in ('where python3 2^>nul') do (
    set "filePath=%%i"
    set "filteredPath=!filePath:WindowsApps=!"
    if "!filePath!"=="!filteredPath!" (
        set "PYTHON_CMD=%%i"
        goto :python_found
    )
)

:: 3. Check default LocalAppData Python installation paths
for /d %%d in ("%LocalAppData%\Programs\Python\Python*") do (
    if exist "%%d\python.exe" (
        set "PYTHON_CMD=%%d\python.exe"
        goto :python_found
    )
)

:: 4. Fallback to default python command
if "%PYTHON_CMD%"=="" (
    set "PYTHON_CMD=python"
)

:python_found
echo Using Python command: %PYTHON_CMD%

:: Check if venv directory exists, if not create it
if not exist "venv" (
    echo Creating virtual environment venv...
    "%PYTHON_CMD%" -m venv venv
    if !errorlevel! neq 0 (
        echo Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Activate venv and install dependencies
echo Activating virtual environment...
call venv\Scripts\activate.bat
if !errorlevel! neq 0 (
    echo Failed to activate virtual environment.
    pause
    exit /b 1
)

echo Installing dependencies from requirements.txt...
pip install -r requirements.txt
if !errorlevel! neq 0 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)

:: Start the Edge TTS backend server
echo Starting Edge TTS Backend on http://localhost:8000...
python main.py
