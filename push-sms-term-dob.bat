@echo off
rem Commit the SMS history term picker, the date-of-birth dropdowns and the
rem mobile layout of the learner forms, and push them to mnakwebwa-contribution.
rem Output: push-sms-term-dob.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-sms-term-dob.log"
set "BRANCH=mnakwebwa-contribution"
echo Push SMS term picker + DOB dropdowns  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the SMS history and date of birth changes to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/components/DateOfBirthSelect.tsx client/components/DateOfBirthSelect.spec.tsx client/components/EditLearnerModal.tsx client/components/IndividualLearnerModal.tsx client/components/SmsHistoryPanel.tsx client/components/admissions/AdmissionsWorkspace.tsx client/components/admissions/AdmissionsWorkspace.spec.tsx client/global.css client/pages/admin/ReportCards.tsx push-sms-term-dob.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "SMS history term picker; date of birth as day/month/year dropdowns; mobile layout for learner forms" -m "Report Cards > SMS History: term, year and class pickers always visible (term and year shared with the Report Cards tab); class chosen from a list instead of typing a class ID." -m "Add learner, Edit learner (Class Management, My Class) and Admissions: date of birth chosen with Day / Month / Year dropdowns instead of a calendar. Editing keeps an exact date of birth (it was replaced by 1 January when only the year was sent); a learner with only a birth year can keep just the year." -m "Phones: learner forms open as full-height sheets, one column, 16px fields (no zoom on tap), bigger tap targets in SMS history." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0119Qym5wf3gkQ1vULHfNefv" >>"%LOG%" 2>&1
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

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-sms-term-dob.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
