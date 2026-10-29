@echo off
rem Commit the subject spelling fix (one subject, whatever the spelling;
rem Results Data Check joins spellings) and push it to the mnakwebwa-contribution branch.
rem Output: push-subject-spellings.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-subject-spellings.log"
set "BRANCH=mnakwebwa-contribution"
echo Push subject spellings  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the subject spelling fix to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/services/subjectMatch.ts client/services/subjectMatch.spec.ts client/services/subjectSpellings.spec.ts client/services/resultsService.ts client/services/resultsGridLoader.ts client/services/resultsDataCheck.ts client/pages/admin/ResultsDataCheck.tsx sms-functions/functions/src/lib/subjectMatch.js sms-functions/functions/src/lib/messageFormatter.js RESULTS_CONSISTENCY.md push-subject-spellings.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Subjects: one spelling per subject (PRINCIPLES OF ACCOUNTS = Priciples of Accounts)" -m "normalizeSubjectName forgives case, spaces, punctuation, &/and and small typos (unique match only); unknown ALL CAPS / lower case subjects go to Title Case; every name in the subject list maps as before. Same rules on the SMS server." -m "Marks are read under the one spelling (grid, report cards, monitor, analysis) and a class with two assignments for one subject shows it once. Results Data Check: Same subject, different spellings (all terms) saves every mark under the one spelling, newer mark kept on a clash, and lists duplicate assignments." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p72uUcX555gihYoFvd" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-subject-spellings.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
