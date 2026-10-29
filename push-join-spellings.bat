@echo off
rem Commit the Join spellings fix (Results Data Check) and push it to the mnakwebwa-contribution branch.
rem Output: push-join-spellings.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-join-spellings.log"
set "BRANCH=mnakwebwa-contribution"
echo Push join spellings  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the Join spellings fix to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/services/resultsDataCheck.ts client/pages/admin/ResultsDataCheck.tsx client/pages/admin/ResultsDataCheck.spellings.spec.tsx client/services/subjectSpellings.spec.ts push-join-spellings.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Results Data Check: Join spellings reads the marks once, shows progress and the outcome in the card" -m "Add the key (subject key for the security rules) now uses the class's real subject assignment, even one created under an older spelling, and reads the rows once." -m "Joining used to read every mark one by one (minutes with all terms, the dialog only said Processing). It now reads the results once, saves in batches with a progress line, shows what changed or why it failed in the card itself, and skips (and lists) marks it cannot move instead of failing all." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p72uUcX555gihYoFvd" >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== push>>"%LOG%"
git push origin %BRANCH% >>"%LOG%" 2>&1
if errorlevel 1 goto :pushfailed
git log -1 --oneline>>"%LOG%" 2>&1

echo ==== status after>>"%LOG%"
git status --short>>"%LOG%" 2>&1
echo ALL DONE>>"%LOG%"
echo  Done. Pushed to %BRANCH%.
goto :end

:wrongbranch
echo STOPPED: on branch %CUR%, not %BRANCH%>>"%LOG%"
echo  STOPPED: you are on branch %CUR%, not %BRANCH%. Nothing was changed.
goto :end

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-join-spellings.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
