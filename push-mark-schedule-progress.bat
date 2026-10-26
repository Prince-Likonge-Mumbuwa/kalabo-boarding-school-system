@echo off
rem Commit the mark schedule progress pages (every learner across the year's
rem tests + class progress chart) and push to mnakwebwa-contribution.
rem Output: push-mark-schedule-progress.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-mark-schedule-progress.log"
set "BRANCH=mnakwebwa-contribution"
echo Push mark schedule progress  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the mark schedule progress pages to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/services/markScheduleProgress.spec.ts client/services/markScheduleProgress.ts client/services/markScheduleProgressLoader.ts client/services/pdf/markSchedulePDF.spec.ts client/services/pdf/markScheduleProgressPDF.ts RESULTS_CONSISTENCY.md client/pages/teacher/ResultsEntry.spec.tsx client/pages/teacher/ResultsEntry.tsx client/services/pdf/markSchedulePDF.ts client/services/resultsConsistency.spec.ts push-mark-schedule-progress.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Mark schedule PDF: performance progress for every learner across the year's tests, and a class progress chart" -m "Replaces the empty Term Performance Summary page (it looked marks up by admission number while results are saved by learner record, used one test's total for all tests, and stopped after one page). New landscape pages from the same grids as the report cards: every learner, Term 1 W4/W8/EOT/term average ... up to the term shown, year average, grade, position and change, class average row, all learners over as many pages as needed; then the class average and pass rate test by test with the 40% line, grade spread, test-by-test statistics, most improved and learners who need attention." -m "Also: the schedule's Entered/Absent/Pending figures no longer overlap the table header; Download shows Preparing while the year's marks load; if they cannot be loaded the schedule still downloads with the reason." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DgMgBZ459HqvJRafDCVkZU" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-mark-schedule-progress.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
