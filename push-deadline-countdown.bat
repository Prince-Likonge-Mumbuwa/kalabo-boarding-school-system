@echo off
rem Commit the live results-deadline countdown and the tidied dashboard
rem results warning, and push to mnakwebwa-contribution.
rem Output: push-deadline-countdown.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-deadline-countdown.log"
set "BRANCH=mnakwebwa-contribution"
echo Push deadline countdown  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the deadline countdown to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/components/results/DeadlineCountdown.tsx client/components/results/TeacherResultsWarning.spec.tsx RESULTS_CONSISTENCY.md client/components/results/TeacherResultsWarning.tsx client/pages/teacher/ResultsEntry.spec.tsx client/pages/teacher/ResultsEntry.tsx client/services/resultsDeadlines.spec.ts client/services/resultsDeadlines.ts push-deadline-countdown.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Results deadlines: live countdown to the second for teachers; tidier results-to-enter panel on the dashboard" -m "Teachers see a live days:hours:minutes:seconds countdown to the end of each results deadline day: blue with more than 3 days left, amber within 3 days, red in the last 24 hours, and counting up as overdue after it. Dashboard: the nearest deadline as a big clock with Enter now, other deadlines as one line each. Results Entry: the selected test shows the countdown." -m "The dashboard results warning no longer repeats itself: one header with progress, then one short list per test (class, subject, how many still to enter, Enter), in deadline order; earlier terms are one collapsed line each; compact mode is one line with the countdown." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DgMgBZ459HqvJRafDCVkZU" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-deadline-countdown.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
