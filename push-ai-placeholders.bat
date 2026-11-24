@echo off
rem Commit the AI placeholder pages, the superAdmin console and the new
rem ai-server folder, and push them to the mnakwebwa-contribution branch.
rem Output: push-ai-placeholders.log
rem (No Firestore rules or packages of the website changed, so nothing to deploy or install.)
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-ai-placeholders.log"
set "BRANCH=mnakwebwa-contribution"
echo Push AI placeholders  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the AI placeholder pages and superAdmin console to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

rem ai-server/.gitignore keeps .env, storage and node_modules out of the commit.
git add -A -- client ai-server push-ai-placeholders.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "AI Tools placeholder pages, superAdmin console and a separate AI server" -m "New ai-server folder (Express, file storage, no Firebase data): one-time superAdmin account, AI feature switches, teacher access list, curriculum library upload with subject/level/type, usage log. Teachers are identified by their existing sign-in token. School app: AI Tools menu for teachers (lesson plan, scheme of work, assessment, record of work, eFile placeholders) and /superadmin console. The menu is hidden on sites where VITE_AI_API_URL is not set." -m "Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p4c9eVai5Mb9ZWtEMf" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-ai-placeholders.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
