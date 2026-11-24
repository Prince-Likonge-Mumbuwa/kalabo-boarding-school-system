@echo off
rem Commits and pushes the AI server hosting work:
rem  - Oracle Cloud (free) or Hostinger VPS: ai-server/Dockerfile, .dockerignore,
rem    deploy/ (compose, Caddy, setup, update, backup, upload, receive, download),
rem    package.json (start:prod)
rem  - DeepInfra with NVIDIA as backup (ai-server/src, .env.example,
rem    check-deepinfra), and the "written without search" note on the website
rem  - the NVIDIA stress test and DEPLOY_AI_SERVER.md
rem Safe to run again later. No new packages to install. Output: push-ai-hosting.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-ai-hosting.log"
set "BRANCH=mnakwebwa-contribution"
echo Push AI hosting  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the AI server hosting files to GitHub...
for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed
echo ==== type check (ai-server)>>"%LOG%"
pushd ai-server
call npm run typecheck>>"%LOG%" 2>&1
set "TSERR=%ERRORLEVEL%"
popd
if not "%TSERR%"=="0" goto :typefailed
git add -- ai-server/Dockerfile ai-server/.dockerignore ai-server/deploy ai-server/package.json ai-server/.env.example ai-server/scripts ai-server/src client/services/aiApi.ts client/pages/teacher/ai/AiFeature.tsx run-nvidia-stress.bat check-deepinfra.bat DEPLOY_AI_SERVER.md push-ai-hosting.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "AI server: Oracle Cloud (free, ARM) or Hostinger VPS hosting, DeepInfra with NVIDIA fallback" -m "Dockerfile (Node 24 on Debian 13, as ChromaDB needs glibc 2.39; runs on ARM and x64) runs ChromaDB and the AI server in one container; deploy/docker-compose.yml adds Caddy for automatic HTTPS at ai.kalaboboarding.com, with setup (Oracle firewall rules or ufw), update, nightly backup, upload and backup-download scripts. Writing and search can use DeepInfra (WRITER_HOSTS, SEARCH_HOSTS) with NVIDIA as backup: a host that fails before writing hands over to the next and is tried last for 2 minutes; indexing always uses the first search host. If search fails everywhere, documents are written from the syllabus and teaching module with a notice. Adds check-deepinfra and the NVIDIA stress test. See DEPLOY_AI_SERVER.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p56dtpeaeEZE4CXRP2" >>"%LOG%" 2>&1
if errorlevel 1 goto :failed
git push origin %BRANCH% >>"%LOG%" 2>&1
if errorlevel 1 goto :pushfailed
echo ALL DONE>>"%LOG%"
echo  Done. Pushed to %BRANCH%.
goto :end
:wrongbranch
echo  STOPPED: you are on branch %CUR%, not %BRANCH%. Nothing was changed.
goto :end
:typefailed
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-ai-hosting.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-ai-hosting.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
