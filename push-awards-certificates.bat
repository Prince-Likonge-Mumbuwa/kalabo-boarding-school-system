@echo off
rem Commit the award certificates feature and push it to the
rem mnakwebwa-contribution branch. Output: push-awards-certificates.log
rem (No Firestore rules changed, so nothing to deploy.)
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-awards-certificates.log"
set "BRANCH=mnakwebwa-contribution"
echo Push award certificates  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the award certificates to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

rem New package @pdf-lib/fontkit: update pnpm-lock.yaml so the server build finds it.
echo ==== pnpm install>>"%LOG%"
where pnpm >nul 2>&1
if errorlevel 1 goto :nopnpm
call pnpm install >>"%LOG%" 2>&1
if errorlevel 1 goto :installfailed

git add -A -- client package.json pnpm-lock.yaml push-awards-certificates.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Award certificates for the overall top three per class and per grade level" -m "New Awards tab in Results & SBA. Ranks learners on the report card's overall percentage (all subjects; Week 4, Week 8 and End of Term), complete results and passes only, ties share a place. Admin can untick winners and download one PDF: gold 1st (Excellence), silver 2nd (Merit), bronze 3rd (Achievement), laurel on grade level awards, stable serial numbers. Open-licence fonts in client/assets/fonts; adds @pdf-lib/fontkit." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p5UcV8qcm3CepgQZm8" >>"%LOG%" 2>&1
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

:nopnpm
echo STOPPED: pnpm not found>>"%LOG%"
echo  STOPPED: pnpm is not installed, so the lock file can't be updated. Nothing was committed.
goto :end

:installfailed
echo STOPPED: pnpm install failed>>"%LOG%"
echo  STOPPED: pnpm install failed. See push-awards-certificates.log
goto :end

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-awards-certificates.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
