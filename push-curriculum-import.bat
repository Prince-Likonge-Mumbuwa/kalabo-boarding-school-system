@echo off
rem Commit the bulk import of class allocation (Timetable generator ->
rem Curriculum) and push it to the mnakwebwa-contribution branch.
rem Output: push-curriculum-import.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-curriculum-import.log"
set "BRANCH=mnakwebwa-contribution"
echo Push curriculum bulk import  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the curriculum bulk import to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/services/timetableGenerator/curriculumImport.ts client/services/timetableGenerator/curriculumImport.spec.ts client/components/timetable/builder/CurriculumImportCard.tsx client/components/timetable/builder/CurriculumPanel.tsx client/pages/admin/TimetableBuilder.spec.tsx TIMETABLE_GENERATOR.md push-curriculum-import.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Timetable curriculum: bulk import of class allocation from CSV or pasted Excel rows" -m "Curriculum tab -> Bulk import class allocation. One row per class or level and subject (Class / Level, Subject, Periods, Most, Doubles, Triples, Time of day, Not P8, Room, Taken). Level rows apply to every class of the level; class rows with other numbers or Taken = No become class exceptions; subjects listed only for some classes are taken only by them. Replace or add/update modes; levels not in the file are untouched; new room names add special rooms." -m "Rows are checked first (line number and reason for each problem, those rows skipped); applying puts the result in the tab as unsaved changes to review and save. Download template exports the current class allocation and round-trips." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DgMgBZ459HqvJRafDCVkZU" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-curriculum-import.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
