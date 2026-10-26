@echo off
rem Commit results-entry deadlines (Week 4, Week 8, End of Term per term)
rem and push them to the mnakwebwa-contribution branch.
rem Output: push-results-deadlines.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-results-deadlines.log"
set "BRANCH=mnakwebwa-contribution"
echo Push results deadlines  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the results deadlines to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/pages/admin/ExamManagement.spec.tsx client/services/examConfigService.spec.ts client/services/resultsDeadlines.spec.ts client/services/resultsDeadlines.ts RESULTS_CONSISTENCY.md client/components/departments/hod/HodResultsTab.tsx client/components/results/TeacherResultsWarning.tsx client/hooks/useResultsEntryMonitor.ts client/pages/admin/ExamManagement.tsx client/pages/admin/ResultsEntryMonitor.tsx client/pages/teacher/ResultsEntry.spec.tsx client/pages/teacher/ResultsEntry.tsx client/services/examConfigService.ts client/services/resultsConsistency.spec.ts client/services/resultsMonitor.ts client/types/exam.ts push-results-deadlines.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Results entry deadlines per test (Week 4, Week 8, End of Term) for each term" -m "Exam Management: 'Results due by' per test, checked (not before the test date or term start; W4 <= W8 <= EOT; none for a switched-off test); not copied to another term. Teachers: deadline on each test button and a banner for the selected test on Results Entry (days left / overdue, learners still without marks); dashboard warning lists deadlines nearest first and counts overdue entries. Admin monitor: deadlines with school progress and teachers overdue, 'N overdue' badges and an Overdue filter; HoDs see the same. Deadlines do not lock entry." -m "Fix: editing an exam configuration with a blank date sent undefined, which Firestore refuses; cleared fields are now saved as null." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DgMgBZ459HqvJRafDCVkZU" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-results-deadlines.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
