@echo off
rem Commits and pushes: per-subject ECZ styles, marking keys matched to diagrams,
rem maths constructions and loci, and the eFile (Teacher's File sections + PDF).
rem No new packages to install. Output: push-efile-assessments.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-efile-assessments.log"
set "BRANCH=mnakwebwa-contribution"
echo Push eFile and assessments  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the eFile and assessment update to GitHub...
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
git add -- client ai-server/src AI_EFILE.md push-efile-assessments.bat >>"%LOG%" 2>&1
git diff --cached --name-only | findstr /i /r "\.env$ ai-server/storage/" >nul
if not errorlevel 1 goto :secrets
git diff --cached --stat>>"%LOG%" 2>&1
git commit -m "eFile as a Teacher's File with PDF export; subject ECZ styles; constructions; keys match diagrams" -m "eFile: 13 Ministry sections (personal record form, AI documents filed by kind, teacher entries from ready tables), stored beside the documents. PDF with pdf-lib: whole file with cover, contents and dividers, a section, a document or an entry, with letterhead, tables, figures, maths and page numbers (DejaVu Serif). Assessments: ECZ question and marking style per subject (Biology figure-led; Maths keys as worked equations with M1/A1/B1); the server corrects marking-key names that contradict lettered diagrams; new construction figure (triangle from SSS/SAS/SSA/ASA, loci, hatched region, compass arcs) with measured answers for the key. See AI_EFILE.md." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p56dtpeaeEZE4CXRP2" >>"%LOG%" 2>&1
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
echo  STOPPED: the AI server code has a type error. Nothing was committed. See push-efile-assessments.log
goto :end
:secrets
git reset -q >>"%LOG%" 2>&1
echo  STOPPED: a .env or storage file was about to be committed. Nothing was committed.
goto :end
:failed
echo  STOPPED: could not commit. See push-efile-assessments.log
goto :end
:pushfailed
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end
:end
echo.
timeout /t 8 >nul
endlocal
