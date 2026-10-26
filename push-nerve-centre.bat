@echo off
rem Commit the admin dashboard nerve centre and push to mnakwebwa-contribution.
rem Output: push-nerve-centre.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-nerve-centre.log"
set "BRANCH=mnakwebwa-contribution"
echo Push nerve centre  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the admin dashboard nerve centre to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- ADMIN_DASHBOARD.md client/components/nerve/NervePanels.tsx client/hooks/useNerveCentre.ts client/pages/AdminDashboard.spec.tsx client/services/nerveCentre.spec.ts client/services/nerveCentre.ts client/services/nerveCentreLoader.ts client/test/nerveFixture.ts client/pages/AdminDashboard.tsx client/pages/admin/ResultsEntryMonitor.tsx push-nerve-centre.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Admin dashboard: the school's nerve centre" -m "Command band with a live clock, term and week, and five vital signs (present today vs last week, daily registers, lessons, results entry with the deadline countdown, pass rate vs last term). Needs attention: only what is wrong, worst first, each linking to the fix (registers not taken, lessons with no teacher, missed registers, results overdue or due soon, exam set-up problems, subjects with no teacher, classes without a form teacher, failed SMS, learners at risk, sponsor names, expiring codes, missing guardian phones); All clear when nothing is wrong." -m "Today: attendance with a 10-day trend, by form, lowest class and registers not taken; lessons by period; staff on leave, covers and vacancies. This term: timeline with test dates, deadlines and holidays; results entry per test; pass rate test by test beside last term, quality, by form, strongest and weakest subjects. Learners at risk, enrolment by form and gender, sponsors, data quality, recent activity. Head teacher / Operations focus, daily brief to copy or send on WhatsApp, each panel loads and refreshes on its own. Results Monitor opens pre-filtered from ?status=." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DgMgBZ459HqvJRafDCVkZU" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-nerve-centre.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
