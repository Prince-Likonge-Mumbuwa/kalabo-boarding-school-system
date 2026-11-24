@echo off
rem Commit the AI tools (Nemotron + RAG with ChromaDB) and push them to the
rem mnakwebwa-contribution branch. Output: push-ai-tools.log
rem (No Firestore rules or website packages changed, so nothing to deploy or install.)
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-ai-tools.log"
set "BRANCH=mnakwebwa-contribution"
echo Push AI tools  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the AI tools to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

rem ai-server/.gitignore keeps .env (your NVIDIA key), storage and node_modules out of the commit.
git add -A -- client ai-server push-ai-tools.bat push-ai-placeholders.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== check: no secrets staged>>"%LOG%"
git diff --cached --name-only | findstr /i /r "ai-server/\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "AI tools: curriculum maps from the CDC syllabi; topic dropdowns, assessment sections" -m "ai-server: syllabus PDFs (type Syllabus) are read into curriculum maps: topic, sub-topic, specific competences, learning activities and expected standards, from the CDC five-column table using the codes (Form = first digit). Fixes the CorelDRAW shifted text in extraction and indexing. Maps start as drafts; the superAdmin reviews, corrects and approves them in the new Syllabus maps section. Approved maps feed the teacher forms and are put into every prompt word for word. Assessments take a section plan (question type, number of questions, marks) checked on the server. Teaching-module passages are tagged with their sub-topic and searched first; assessments also see past-paper passages as examples of ECZ questioning, with an ECZ style guide (command words and mark values) in the prompt; past-paper PDFs that draw text several times are read once. School app: lesson plan topic and sub-topic dropdowns with the competence shown; assessment and scheme of work topic checklists; assessment sections builder with presets; typed boxes remain when no map is approved. Includes the earlier AI tools work (Nemotron, RAG with ChromaDB, eFile, superAdmin console) if not pushed yet." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p4c9eVai5Mb9ZWtEMf" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-ai-tools.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
