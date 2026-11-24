@echo off
rem Commits and pushes the Biology diagrams update to the mnakwebwa-contribution branch:
rem   - redrawn heart, ear, foetus, arm muscles, reflex arc, guard cells, burst cell;
rem   - new scenes: microscope, photosynthesis experiments, food test, villus,
rem     blood vessels, tissue fluid, housefly;
rem   - food webs that route arrows round the organisms' names.
rem No new packages, so nothing to install. Output: push-biology-diagrams.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-biology-diagrams.log"
set "BRANCH=mnakwebwa-contribution"
echo Push Biology diagrams  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the Biology diagrams update to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== type check (ai-server)>>"%LOG%"
pushd ai-server
call npm run typecheck>>"%LOG%" 2>&1
set "TSERR=%ERRORLEVEL%"
popd
if not "%TSERR%"=="0" goto :typefailed

git add -- client/components/ai/figures ai-server/src/services/figures/sceneCatalog.ts ai-server/src/services/generation/figures.ts BIOLOGY_FIGURES_STUDY.md push-biology-diagrams.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== check: no secrets staged>>"%LOG%"
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Biology diagrams: clearer organs, new practicals and structures" -m "Redrawn: heart (vessels rise from their ventricles, valves with tendons, flow arrows), ear (section through the skull, separate ossicles, coiled cochlea), foetus in the uterus, arm muscles, reflex arc, guard cells in real epidermis, burst red cell. New scenes: compound microscope (mirror/lamp), photosynthesis (pondweed oxygen, variegated leaf and foil starch tests), food test in a water bath, villus, blood vessels (T.S. and vein valves), tissue fluid and lymph, housefly. Food webs: rows ordered by up/down sweeps and arrows bend round names. Scene catalog updated in both copies; the AI server offers the new scenes to Biology. See BIOLOGY_FIGURES_STUDY.md section 7." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p56dtpeaeEZE4CXRP2" >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== push>>"%LOG%"
git push origin %BRANCH% >>"%LOG%" 2>&1
if errorlevel 1 goto :pushfailed
git log -1 --oneline>>"%LOG%" 2>&1
echo ALL DONE>>"%LOG%"
echo  Done. Pushed to %BRANCH%.
goto :end

:wrongbranch
echo STOPPED: on branch %CUR%, not %BRANCH%>>"%LOG%"
echo  STOPPED: you are on branch %CUR%, not %BRANCH%. Nothing was changed.
goto :end

:typefailed
echo STOPPED: the AI server type check failed>>"%LOG%"
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-biology-diagrams.log
goto :end

:secrets
git reset -q >>"%LOG%" 2>&1
echo STOPPED: a .env or storage file was about to be committed>>"%LOG%"
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-biology-diagrams.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
