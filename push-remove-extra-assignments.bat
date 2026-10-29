@echo off
rem Commit Remove extra assignments (Results Data Check) and push it to the mnakwebwa-contribution branch.
rem Output: push-remove-extra-assignments.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-remove-extra-assignments.log"
set "BRANCH=mnakwebwa-contribution"
echo Push remove extra assignments  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving Remove extra assignments to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/services/resultsDataCheck.ts client/pages/admin/ResultsDataCheck.tsx client/pages/admin/ResultsDataCheck.spellings.spec.tsx client/services/subjectSpellings.spec.ts RESULTS_CONSISTENCY.md push-remove-extra-assignments.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Results Data Check: Remove extra assignments (one assignment per subject per class)" -m "A class with two assignments for one subject keeps the one with a teacher (or, same teacher on both, the correctly spelt one). Marks keys, attendance registers and live timetable periods move to the one kept, its open teacher row is closed as removed, then it is deleted. Two different teachers on one subject are left for the admin. The card says, per class, what is kept and removed." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p72uUcX555gihYoFvd" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-remove-extra-assignments.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
