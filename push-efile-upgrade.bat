@echo off
rem Commits and pushes the eFile upgrade: vision and mission from the admin, the AI work plan,
rem the official syllabus, records of work from evaluated lesson plans, homework and remedial
rem work from lesson plans, the year/term filter, and the new search (embedding) model.
rem No new packages to install. Output: push-efile-upgrade.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-efile-upgrade.log"
set "BRANCH=mnakwebwa-contribution"
echo Push eFile upgrade  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the eFile upgrade to GitHub...
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
git add -- client ai-server/src ai-server/.env.example AI_EFILE.md push-efile-upgrade.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "eFile: admin vision and mission, AI work plan, syllabus, records of work, homework, term filter" -m "Sections 1-2 come from the admin's Vision & mission card in Settings (Firestore system/school_statements). Section 3: the AI writes the Individual Work Plan from the chosen schemes of work and the official curriculum (POST /efile-file/work-plan). Section 6 shows each class's syllabus from the superAdmin's curriculum. Section 9 records every evaluated lesson plan. Lesson plans now include Remedial Work; their homework fills 10 (i) and their remedial work 10 (vii). Sections 6, 9 and 10 follow a year and term picker built from the teacher's real results. Search model changed to nvidia/nemotron-3-embed-1b (503s). See AI_EFILE.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-efile-upgrade.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-efile-upgrade.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
