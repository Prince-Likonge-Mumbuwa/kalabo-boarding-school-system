@echo off
rem Tests how much the NVIDIA API takes before it refuses requests
rem (ai-server/scripts/nvidia-stress.ts). Uses the key in ai-server\.env.
rem Run it when no teacher is generating: while NVIDIA refuses the test,
rem it refuses the teachers too. The report goes to ai-server\storage\stress\.
setlocal EnableExtensions
cd /d "%~dp0ai-server"
echo.
echo  NVIDIA API stress test
echo  ----------------------
echo  Q = quick (bursts only, about 3 minutes)
echo  F = full  (bursts, steady rate and real lesson plans, about 20-30 minutes)
echo.
choice /c QF /n /m "  Quick or full? [Q/F] "
if errorlevel 2 (set "ARGS=") else (set "ARGS=--quick")
echo.
call npx tsx scripts/nvidia-stress.ts %ARGS%
echo.
for /f "delims=" %%f in ('dir /b /o-d "storage\stress\nvidia-*.md" 2^>nul') do (
  echo  Opening the report: storage\stress\%%f
  start "" notepad "storage\stress\%%f"
  goto :done
)
:done
echo.
pause
endlocal
