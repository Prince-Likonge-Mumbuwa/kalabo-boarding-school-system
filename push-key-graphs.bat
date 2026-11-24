@echo off
rem Commits and pushes the drawn graphs, sketches and linear programming regions in marking keys.
rem No new packages to install. Output: push-key-graphs.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-key-graphs.log"
set "BRANCH=mnakwebwa-contribution"
echo Push marking key graphs  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the marking key graphs to GitHub...
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
git add -- client ai-server/src AI_MARKING_KEYS.md push-key-graphs.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "Marking keys: draw graphs, sketches and linear programming regions" -m "answerFigures.ts now draws the answer to draw/plot/sketch questions (quadratics, cubics, lines on the same axes; sketches labelled where they cross the axes and turn) and to inequality and linear programming questions (lines labelled, unwanted side shaded, R and its corners, objective at each corner). These figures are kept out of the AI figure repair. See AI_MARKING_KEYS.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-key-graphs.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-key-graphs.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
