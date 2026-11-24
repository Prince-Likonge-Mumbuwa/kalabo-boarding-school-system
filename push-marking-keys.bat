@echo off
rem Commits and pushes: worked marking keys for Mathematics and Physics (step-by-step equations,
rem complete construction / graph figures, a chief-examiner check), the clean-up of the AI's
rem notes and second drafts (the JSON in marking keys), and the new writing animation.
rem No new packages to install. Output: push-marking-keys.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-marking-keys.log"
set "BRANCH=mnakwebwa-contribution"
echo Push marking keys  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the marking key and animation update to GitHub...
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
git add -- client ai-server/src ai-server/.env.example AI_MARKING_KEYS.md push-marking-keys.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "Worked marking keys, clean documents, writing animation" -m "Mathematics and Physics keys are set out as one equation per line with M1/A1/B1 marks and a boxed answer, and a chief-examiner pass re-solves every question and adds complete figures for constructions, loci and graphs (KEY_CHECK=off to skip). The AI's notes to itself and restarted drafts (the JSON seen in keys) are removed on the server and in the app. Generation shows reading, planning and smooth writing with section progress. See AI_MARKING_KEYS.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-marking-keys.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-marking-keys.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
