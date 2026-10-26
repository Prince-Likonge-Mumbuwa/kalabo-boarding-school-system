@echo off
rem Commit 'classes that do not write a test' (e.g. Grade 12 at End of
rem Term) and push to mnakwebwa-contribution.
rem Output: push-not-written-tests.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-not-written-tests.log"
set "BRANCH=mnakwebwa-contribution"
echo Push not-written tests  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving classes-that-do-not-write-a-test to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/components/exams/NotWrittenByPicker.tsx RESULTS_CONSISTENCY.md client/pages/admin/ExamManagement.spec.tsx client/pages/admin/ExamManagement.tsx client/pages/admin/ReportCards.tsx client/pages/teacher/ResultsEntry.spec.tsx client/pages/teacher/ResultsEntry.tsx client/services/examConfigService.spec.ts client/services/examConfigService.ts client/services/resultsConsistency.spec.ts client/services/resultsGrid.ts client/services/resultsGridLoader.ts client/services/resultsMonitor.ts client/types/exam.ts push-not-written-tests.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Exams: classes that do not write a test this term (e.g. Grade 12 at End of Term)" -m "Exam Management: per test, pick the classes that do not write it (one tap for a whole level) and the reason, e.g. ECZ final examinations. Not copied to another term." -m "For those classes the test is left out of the class's results grid, so every screen agrees: Results Entry does not offer it and says why; it is never missing on the monitor, HoD view or teacher dashboard and has no deadline countdown; report cards (screen, PDF, Parent Portal, SMS) average the other tests with no column for it; the mark schedule progress pages leave it out." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DgMgBZ459HqvJRafDCVkZU" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-not-written-tests.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
