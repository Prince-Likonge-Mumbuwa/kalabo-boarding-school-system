@echo off
rem Commits and pushes the drawn answers in marking keys and the retired-model fallback.
rem No new packages to install. Output: push-answer-figures.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-answer-figures.log"
set "BRANCH=mnakwebwa-contribution"
echo Push answer figures and model fallback  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the answer figures and model fallback to GitHub...
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
git add -- client ai-server/src ai-server/.env.example AI_MARKING_KEYS.md AI_SPEED.md push-answer-figures.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "AI: draw answers in marking keys; survive retired models" -m "Mathematics and Physics keys now show the shaded Venn region, solved Venn surveys, completed constructions with loci and regions, and graphs, drawn by the server (answerFigures.ts). NVIDIA_MODEL takes a comma-separated list and moves to the next model when one is retired; defaults are Nemotron 3.5 Super VL and Nemotron 3.5 Lightning, with reasoning_effort for 3.5 models. See AI_MARKING_KEYS.md and AI_SPEED.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-answer-figures.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-answer-figures.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
