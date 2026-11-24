@echo off
rem Commits and pushes the fix for "&nbsp;" in tests and keys, and more answer figures per question.
rem No new packages to install. Output: push-nbsp-fix.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-nbsp-fix.log"
set "BRANCH=mnakwebwa-contribution"
echo Push fix for HTML spaces  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the fix for HTML spaces to GitHub...
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
git add -- client ai-server/src AI_MARKING_KEYS.md push-nbsp-fix.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "Tests and keys: no raw &nbsp; text; answer figures for 16. style questions" -m "plainSpacing (cleanup.ts and cleanStream.ts) turns HTML spacing into line breaks before saving and when showing old documents; the renderer keeps condition lines apart; prompt rule 13. Answer figures read question headings like 16. Title, allow several figures per question, read all region conditions, and give the average speed. See AI_MARKING_KEYS.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p7BAoiGGb2h4P1rBRZ" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-nbsp-fix.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-nbsp-fix.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
