@echo off
rem Commits and pushes the Lesson Grid section and remedial work written after lesson evaluations.
rem No new packages to install. Output: push-efile-remedial.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-efile-remedial.log"
set "BRANCH=mnakwebwa-contribution"
echo Push eFile lesson grid and remedial work  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the eFile lesson grid and remedial work to GitHub...
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
git add -- client ai-server/src AI_EFILE.md push-efile-remedial.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "eFile: Lesson Grid section; remedial work written after evaluation" -m "The Lesson Grid (Syllabus Analysis Grid) is its own section 7 (later sections move down one; old grids show there by themselves). Lesson plans no longer carry a Remedial Work section: when a saved evaluation shows the lesson did not go well, the AI writes its remedial work into 11 (vii) Remedial Work Plan (remedialWork.ts), one entry per lesson. See AI_EFILE.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-efile-remedial.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-efile-remedial.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
