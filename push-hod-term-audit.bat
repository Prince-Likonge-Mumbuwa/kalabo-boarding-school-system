@echo off
rem Commit the HoD results term picker and the clearer audit trail messages,
rem and push them to the mnakwebwa-contribution branch.
rem Output: push-hod-term-audit.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-hod-term-audit.log"
set "BRANCH=mnakwebwa-contribution"
echo Push HoD term picker + audit trail messages  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the HoD term picker and audit trail changes to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/pages/teacher/MyDepartment.tsx client/components/departments/hod/HodResultsTab.tsx client/lib/auditedFirestore.ts client/services/auditService.ts client/pages/admin/AuditTrail.tsx client/pages/admin/AuditTrail.spec.tsx AUDIT_TRAIL.md push-hod-term-audit.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "HoD results monitor: term picker; audit trail says who saved what, for which class, subject, exam and term" -m "My Department > Results gets a term selector (Term 1-3 of the current academic year, current term by default), like the admin Results Entry Monitor." -m "Audit trail entries now read as sentences with the person's name and the context, e.g. 'Muhau Nakwebwa saved Week 4 marks for 38 learners - Form 2A, Mathematics, Term 3 2026'. Class, subject, exam type, term and year are recorded first with every change; older entries and deletions read them from the result ID. Registers name the class, subject, date and periods; SBA saves name the class and subject." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0119Qym5wf3gkQ1vULHfNefv" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-hod-term-audit.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
