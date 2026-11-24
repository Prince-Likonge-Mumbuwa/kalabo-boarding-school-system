@echo off
rem Installs the new packages, then commits and pushes the AI tools update to
rem the mnakwebwa-contribution branch:
rem   - assessment figures (maps, graphs, charts, timelines, trees, diagrams,
rem     structures, maths) and the diagram library;
rem   - the teaching-module update (if push-teaching-modules.bat was not run).
rem Output: push-assessment-figures.log
rem
rem Why install first: Hostinger builds from GitHub with pnpm and refuses a
rem pnpm-lock.yaml that does not match package.json, so the lock file must be
rem updated here and pushed with the code.
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-assessment-figures.log"
set "BRANCH=mnakwebwa-contribution"
echo Push assessment figures  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the assessment figures update to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo  Installing website packages (pnpm install)...
echo ==== pnpm install>>"%LOG%"
call pnpm install>>"%LOG%" 2>&1
if errorlevel 1 goto :installfailed

echo  Installing AI server packages (npm install)...
echo ==== npm install (ai-server)>>"%LOG%"
pushd ai-server
call npm install>>"%LOG%" 2>&1
set "NPMERR=%ERRORLEVEL%"
popd
if not "%NPMERR%"=="0" goto :installfailed

echo ==== type check (ai-server)>>"%LOG%"
pushd ai-server
call npm run typecheck>>"%LOG%" 2>&1
set "TSERR=%ERRORLEVEL%"
popd
if not "%TSERR%"=="0" goto :typefailed

rem ai-server/.gitignore keeps .env (your NVIDIA key), storage (incl. teachers' pictures) and node_modules out.
git add -A -- client ai-server public/geo package.json pnpm-lock.yaml vite.config.ts AI_TEACHING_MODULES.md AI_ASSESSMENT_FIGURES.md push-teaching-modules.bat push-assessment-figures.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== check: no secrets staged>>"%LOG%"
git diff --cached --name-only | findstr /i /r "ai-server/\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "AI assessments: accurate figures, maths and a diagram library" -m "Assessments can set questions on figures the way ECZ papers do. The AI describes each figure as a figure JSON block; the AI server checks it (zod; map names against the app's map data; graphs solved with mathjs; molecules from PubChem), asks the AI once for find-and-replace fixes, and saves worked answers with each figure. The app draws them in black and white: graphs, bar/line charts and histograms, timelines, succession and family trees, sketch maps from Natural Earth and Zambia geoBoundaries (provinces, districts, lakes, rivers, seas, regions, kingdoms, routes, key, scale, north arrow), Mermaid diagrams, structural formulae (smiles-drawer), and maths in TeX with MathJax (mhchem for chemistry). Checked answers and problems show under each figure on screen only. Word export turns figures and maths into PNG pictures. New diagram library: teachers upload or photograph diagrams, crop them, place letters, get suggestions from the NVIDIA vision model, share them, and pick them for a test. Assessment form: Diagrams (none/some/many) and library pictures. Heavy libraries load only with documents that need them (vite manualChunks). Includes the teaching-module update (CDC modules, Ministry CBC lesson plan, lesson evaluation, landscape schemes, record of work from lesson plans). See AI_ASSESSMENT_FIGURES.md and AI_TEACHING_MODULES.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p4p1H1cEBKwiBd1CEf" >>"%LOG%" 2>&1
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

:installfailed
echo STOPPED: package install failed>>"%LOG%"
echo  STOPPED: installing packages failed (are you online?). Nothing was committed. See push-assessment-figures.log
goto :end

:typefailed
echo STOPPED: the AI server type check failed>>"%LOG%"
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-assessment-figures.log
goto :end

:secrets
git reset -q >>"%LOG%" 2>&1
echo STOPPED: ai-server/.env or storage was about to be committed>>"%LOG%"
echo  STOPPED: your .env or storage folder was about to be committed. Nothing was committed.
goto :end

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-assessment-figures.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
