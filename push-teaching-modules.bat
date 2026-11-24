@echo off
rem Commit the AI tools update (CDC teaching modules, Ministry CBC lesson plan,
rem lesson evaluation, CBC assessments, embedding model) and push it to the
rem mnakwebwa-contribution branch. Output: push-teaching-modules.log
rem (No Firestore rules or website packages changed, so nothing to deploy or install.)
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-teaching-modules.log"
set "BRANCH=mnakwebwa-contribution"
echo Push teaching modules  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the AI teaching-module update to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

rem ai-server/.gitignore keeps .env (your NVIDIA key), storage and node_modules out of the commit.
git add -A -- client ai-server AI_TEACHING_MODULES.md push-teaching-modules.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== check: no secrets staged>>"%LOG%"
git diff --cached --name-only | findstr /i /r "ai-server/\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "AI tools: follow the CDC teaching modules; Ministry CBC lesson plan; lesson evaluation" -m "ai-server: CDC teaching modules (uploaded as Teacher's guide) are read after indexing into topics, sub-topics, learning activities (environment, materials, methods, how to conduct, content tips), hooks, key terms, general competences, expected standards, CBC rubrics and terms (ModuleParser, TeachingModuleService). Lesson plans follow the module appendix format (Lesson Goal, Rationale, Learning Environment, Lesson Progression: Stage, Teacher's Role, Learners' Role, Assessment Criteria) built on the chosen module activities. Schemes of work use CBC columns, the module activities and the term's topics. Test papers tie every question to a learning objective and end with a specification grid; new CBC formative/summative types with scenario and 4-level rubric. A module stands in for a syllabus map when a subject has none. Fixes: Word PDFs were corrupted by the CorelDRAW repair; topic-code search mixed numberings across subjects. New: lesson evaluation draft/save endpoints; npm run read-module; embedding model nvidia/nemotron-3.5-embed-1b (the old one was retired). Schemes of work print and download landscape and have no assessment plan; curriculum sources are no longer printed in documents (shown on screen only, and [n] source numbers are hidden). Record of work is filled in from the class's lesson plans in the eFile for the chosen week (LessonImport). School app: module activity checklist, Lesson n of N, date and time; CBC assessment types with rubric size; Evaluate lesson dialog on saved lesson plans; eFile shows evaluated / to evaluate; superAdmin Teaching modules list. See AI_TEACHING_MODULES.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p4p1H1cEBKwiBd1CEf" >>"%LOG%" 2>&1
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

:secrets
git reset -q >>"%LOG%" 2>&1
echo STOPPED: ai-server/.env or storage was about to be committed>>"%LOG%"
echo  STOPPED: your .env or storage folder was about to be committed. Nothing was committed.
goto :end

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-teaching-modules.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
