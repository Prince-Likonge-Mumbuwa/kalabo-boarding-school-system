@echo off
rem Commits and pushes the Ministry-format Individual Work Plan and the Syllabus Analysis Grid.
rem No new packages to install. Output: push-efile-grid.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-efile-grid.log"
set "BRANCH=mnakwebwa-contribution"
echo Push eFile work plan and grid  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the eFile work plan and grid to GitHub...
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
git add -- client ai-server/src ai-server/.env.example AI_EFILE.md push-efile-grid.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "eFile: Ministry-format work plan and Syllabus Analysis Grid" -m "The Individual Work Plan follows the Ministry format (key result area, principal accountability, schedule of activities, target; assumptions; signatures) with targets counted from the timetable and calendar, for a term or the year. New Syllabus Analysis Grid in section 6: the twelve school columns week by week from the official curriculum and the class scheme of work. See AI_EFILE.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-efile-grid.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-efile-grid.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
