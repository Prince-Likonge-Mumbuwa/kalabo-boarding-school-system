@echo off
rem Commit the timetable generator, push it to the mnakwebwa-contribution
rem branch, then deploy the Firestore rules. Output: push-timetable-generator.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-timetable-generator.log"
set "BRANCH=mnakwebwa-contribution"
set "PROJECT=catalyst-f1b1a"
echo Push timetable generator  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the timetable generator to GitHub and deploying the rules...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

if exist client\components\timetable\PeriodTickGrid.tsx git rm -q client/components/timetable/PeriodTickGrid.tsx>>"%LOG%" 2>&1
git add -A -- client firestore.rules firestore-tests TIMETABLE_GENERATOR.md TIMETABLE_ATTENDANCE.md push-timetable-generator.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Automatic timetable generator; teachers receive the published timetable" -m "Readiness (every department's HoD marks allocations complete), curriculum per level (fewest-most periods, doubles, triples, mornings only / prefer mornings, not P8, special rooms), class exceptions, fixed school events. Clash-free solver (class, teacher incl. cover, room; no lesson across the break) with a capacity check, drafts, hand moves and swaps, locks, regenerate, publish by admin with history kept by date. Timetabler role for chosen HoDs." -m "My Timetable is read-only with days as rows and periods as columns, class timetables and branded PDFs. Teachers no longer submit timetables (rules). Approvals tab replaced by the generator." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PBvpHATuwMadM8Q6NHiSrT" >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== push>>"%LOG%"
git push origin %BRANCH% >>"%LOG%" 2>&1
if errorlevel 1 goto :pushfailed
git log -1 --oneline>>"%LOG%" 2>&1

echo ==== deploy rules>>"%LOG%"
call firebase deploy --only firestore:rules --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
if errorlevel 1 goto :rulesfailed

echo ==== status after>>"%LOG%"
git status --short>>"%LOG%" 2>&1
echo ALL DONE>>"%LOG%"
echo  Done. Pushed to %BRANCH% and the rules are live.
goto :end

:wrongbranch
echo STOPPED: on branch %CUR%, not %BRANCH%>>"%LOG%"
echo  STOPPED: you are on branch %CUR%, not %BRANCH%. Nothing was changed.
goto :end

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-timetable-generator.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:rulesfailed
echo STOPPED: pushed, but the rules deploy failed>>"%LOG%"
echo  Pushed, but the rules were not deployed. See push-timetable-generator.log
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
