@echo off
rem Commit the Class/Subject-only bulk import and the Load curriculum button
rem (Timetable generator -> Curriculum) and push it to the mnakwebwa-contribution branch.
rem Output: push-curriculum-load.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-curriculum-load.log"
set "BRANCH=mnakwebwa-contribution"
echo Push curriculum load  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the curriculum changes to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/services/timetableGenerator/curriculumImport.ts client/services/timetableGenerator/curriculumImport.spec.ts client/components/timetable/builder/CurriculumImportCard.tsx client/components/timetable/builder/CurriculumPanel.tsx client/pages/admin/TimetableBuilder.spec.tsx TIMETABLE_GENERATOR.md push-curriculum-load.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Timetable curriculum: bulk import needs only Class and Subject; Load curriculum from active class assignments" -m "Bulk import class allocation now expects two columns, Class and Subject. A subject keeps the periods and settings it already has (class exception, else level); a new subject starts at 4 periods a week. Older files with Periods, Doubles ... columns still import, blank cells keep the current value. Download template gives Class, Subject rows." -m "New Load curriculum button: every active class takes exactly the subjects it has a teacher for this term (owner or live cover/TP); assignments without a teacher are left out with a note. Levels with assignments are replaced, others untouched; the result is unsaved changes to review and save." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p72uUcX555gihYoFvd" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-curriculum-load.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
