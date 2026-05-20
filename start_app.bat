@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: Check if node_modules exists, if not run npm install
if not exist "node_modules" (
    echo Frontend dependencies node_modules not found.
    echo Running "npm install" to install dependencies...
    call npm install
    if !errorlevel! neq 0 (
        echo Error: "npm install" failed.
        pause
        exit /b 1
    )
)

echo Starting Edge TTS Backend in a new window...
start "Edge TTS Backend" cmd /c "start_tts_backend.bat"

echo Starting AI Werewolf Simulator Frontend...
call npm run dev
if !errorlevel! neq 0 (
    echo Frontend server exited with error code !errorlevel!.
    pause
)
