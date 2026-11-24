@echo off
rem Commit and push the Google Cloud cost reductions:
rem   - the admin dashboard and results monitor re-read the database far less often
rem   - teacher / assignment lists refresh every 15 minutes, not 5
rem   - every Cloud Function is capped at 5 copies running at once
rem Runs the app tests first and stops if any fail. Pushes to mnakwebwa-contribution.
rem Output: push-cost-reduction.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-cost-reduction.log"
set "BRANCH=mnakwebwa-contribution"
echo Push cost reduction  %DATE% %TIME%> "%LOG%"
echo.
echo  Checking the tests, then saving the cost reductions to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" (
  git checkout %BRANCH% >>"%LOG%" 2>&1
  if errorlevel 1 goto :noswitch
)

echo ==== tests>>"%LOG%"
call pnpm test >>"%LOG%" 2>&1
if errorlevel 1 goto :testfailed

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/hooks/useNerveCentre.ts client/hooks/useResultsEntryMonitor.ts client/hooks/useSchoolTeachers.ts client/hooks/useTeacherAssignments.ts client/hooks/useOnCoverTeachers.ts sms-functions/functions/index.js push-cost-reduction.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Lower Google Cloud cost: fewer background database reads, cap Cloud Function instances" -m "Admin dashboard: registers and recent activity refresh every 10 minutes (were 2 and 1); learners, classes, teachers and slots stay fresh for 30 minutes. Results entry monitor refreshes every 15 minutes (was 3). Teacher and assignment lists refresh every 15 minutes (were 5). The Refresh button still updates at once." -m "Cloud Functions: maxInstances 5 for every function so a bug or a flood of requests cannot run up the bill." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p46UwMwycWWzUUFCvy" >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git push origin %BRANCH% >>"%LOG%" 2>&1
if errorlevel 1 goto :pushfailed
git log -1 --oneline>>"%LOG%" 2>&1
echo ALL DONE>>"%LOG%"
echo  Done. Pushed to %BRANCH%.
goto :end

:noswitch
echo STOPPED: could not switch to %BRANCH%>>"%LOG%"
echo  STOPPED: could not switch to %BRANCH%. Nothing was changed. See push-cost-reduction.log
goto :end

:testfailed
echo STOPPED: tests failed - nothing was pushed>>"%LOG%"
echo  STOPPED: the tests failed. Nothing was pushed. See push-cost-reduction.log
goto :end

:failed
echo STOPPED: git add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-cost-reduction.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer. See the log.
goto :end

:end
echo.
pause
endlocal
