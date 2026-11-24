@echo off
rem Commits and pushes: the eFile filled from the school system (timetable, registers,
rem marks, analysis), remedial and continuation lessons, and scanned marked scripts.
rem No new packages to install. Output: push-efile-system.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-efile-system.log"
set "BRANCH=mnakwebwa-contribution"
echo Push eFile system data  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the eFile update to GitHub...
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
git add -- client ai-server/src AI_EFILE.md push-efile-system.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "eFile: records from the school system, remedial lessons, scanned scripts" -m "Timetable, class lists, subject registers from attendance, progress chart, analysis sheet and remedial learners are read live from Firestore and printed in the Teacher's File PDF. Lesson evaluations recommend remedial or continuation lessons, which the AI writes from the original plan and its evaluation and links in 10 (vii). Marked scripts (highest, average, lowest per assessment) and own question papers can be scanned with the phone camera; pages are stored on the AI server and printed in the PDF. See AI_EFILE.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p56dtpeaeEZE4CXRP2" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-efile-system.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-efile-system.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
