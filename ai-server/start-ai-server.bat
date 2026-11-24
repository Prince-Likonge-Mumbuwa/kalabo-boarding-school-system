@echo off
rem Starts the AI server (and ChromaDB) when Windows starts, and restarts it
rem if it stops. A shortcut to this file sits in the Windows Startup folder.
rem The Cloudflare tunnel is a Windows service and starts on its own.
rem
rem To stop the AI server: close this window.
rem Log of each run: ai-server\storage\ai-server.log

title Kalabo AI server
cd /d "%~dp0"

rem Already running (for example started from VS Code)? Then do nothing.
netstat -ano | findstr /r /c:":5050 .*LISTENING" >nul
if not errorlevel 1 (
  echo The AI server is already running on port 5050. This window can be closed.
  timeout /t 10 >nul
  exit /b 0
)

if not exist storage mkdir storage

rem Give the network a moment after start-up.
timeout /t 20 >nul

:run
echo [%date% %time%] Starting the AI server...
echo [%date% %time%] Starting the AI server >> storage\ai-server.log
call npm run start:prod >> storage\ai-server.log 2>&1
echo [%date% %time%] The AI server stopped. Restarting in 15 seconds...
echo [%date% %time%] Stopped; restarting in 15 seconds >> storage\ai-server.log
timeout /t 15 >nul
goto run
