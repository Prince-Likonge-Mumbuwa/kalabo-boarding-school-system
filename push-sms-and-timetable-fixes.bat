@echo off
rem Commit and push: the results-SMS average fix (server) and the timetable
rem readiness fix (subjects no department has chosen no longer block it).
rem Pushes to mnakwebwa-contribution (switches to it first; if Git cannot
rem switch without losing work it stops and changes nothing).
rem Output: push-sms-and-timetable-fixes.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-sms-and-timetable-fixes.log"
echo Push SMS + timetable fixes  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the SMS average fix and the timetable fix to GitHub...
echo.

set "BRANCH=mnakwebwa-contribution"
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" (
  echo ==== switch to %BRANCH%>>"%LOG%"
  git checkout %BRANCH% >>"%LOG%" 2>&1
  if errorlevel 1 goto :noswitch
)
echo  Branch: %BRANCH%
echo.

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- sms-functions/functions/src/lib/messageFormatter.js deploy-sms-results-fix.bat client/services/timetableGenerator/problem.ts client/services/timetableGenerator/solver.spec.ts client/components/timetable/builder/ReadinessPanel.tsx TIMETABLE_GENERATOR.md push-sms-and-timetable-fixes.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Results SMS averages every test sat; unchosen subjects no longer block the timetable" -m "Results SMS: the Cloud Function rebuilt each message from End of Term (else Week 8, else Week 4). A subject now shows the average of every active test the learner sat (absent and not-conducted tests ignored, classes that skip a test left out), and AVG is the mean of those subject averages, as on the report card." -m "Timetable readiness: subjects no department has chosen are listed as information only and no longer stop the timetable from being generated." -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p46UwMwycWWzUUFCvy" >>"%LOG%" 2>&1
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

:noswitch
echo STOPPED: could not switch to %BRANCH% without losing changes - nothing was changed>>"%LOG%"
echo  STOPPED: could not switch to %BRANCH%. Nothing was changed. See push-sms-and-timetable-fixes.log
goto :end

:failed
echo STOPPED: git add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-sms-and-timetable-fixes.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer. See the log.
goto :end

:end
echo.
pause
endlocal
