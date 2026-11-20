@echo off
rem Checks your DeepInfra key before the AI server relies on it
rem (ai-server/scripts/check-deepinfra.ts): writing, search vectors, and
rem whether DeepInfra's search matches your index. Changes nothing.
rem First: put DEEPINFRA_API_KEY in ai-server\.env, and start the AI server
rem (npm run dev in ai-server) in another window so ChromaDB is running.
setlocal EnableExtensions
cd /d "%~dp0ai-server"
call npm run check-deepinfra
echo.
pause
endlocal
