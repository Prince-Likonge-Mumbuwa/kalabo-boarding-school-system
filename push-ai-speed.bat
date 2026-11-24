@echo off
rem Commits and pushes the AI server speed and many-teachers update (job-based thinking and
rem lengths, fast model for light jobs, queue, retries, merged file saves, search cache).
rem No new packages to install. Output: push-ai-speed.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-ai-speed.log"
set "BRANCH=mnakwebwa-contribution"
echo Push AI speed  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the AI speed update to GitHub...
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed
echo ==== type check (ai-server)>>"%LOG%"
pushd ai-server
call npm run typecheck>>"%LOG%" 2>&1
set "TSERR=%ERRORLEVEL%"
popd
if not "%TSERR%"=="0" goto :typefailed
git add -- client ai-server/src ai-server/.env.example AI_SPEED.md push-ai-speed.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "AI server: faster generation and a fair queue for many teachers" -m "Each job sets its own thinking (off/low/full via chat_template_kwargs, dropped automatically if a host refuses it), length limit and model (Nemotron 3 Nano for light jobs, falling back to the main model). Writers are limited to WRITER_CONCURRENCY with a FIFO queue whose position is shown to teachers; busy hosts are retried with backoff, stalled streams are given up, and /generate sends a heartbeat. JSON stores merge concurrent saves, last-seen is throttled, searches run in parallel and query embeddings are cached. See AI_SPEED.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
if errorlevel 1 goto :failed
git push origin %BRANCH% >>"%LOG%" 2>&1
if errorlevel 1 goto :pushfailed
echo ALL DONE>>"%LOG%"
echo  Done. Pushed to %BRANCH%.
goto :end
:wrongbranch
echo  STOPPED: you are on branch %CUR%, not %BRANCH%. Nothing was changed.
goto :end
:typefailed
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-ai-speed.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-ai-speed.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
