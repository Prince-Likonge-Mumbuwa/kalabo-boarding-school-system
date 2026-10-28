@echo off
rem Commit the parent summons SMS (Announcements -> One Parent ->
rem Summon to office) and push it to the mnakwebwa-contribution branch.
rem Output: push-parent-summons.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-parent-summons.log"
set "BRANCH=mnakwebwa-contribution"
echo Push parent summons  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the parent summons SMS to GitHub...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/services/smsTemplates.ts client/services/smsTemplates.spec.ts client/components/AnnouncementModal.tsx client/components/AnnouncementModal.spec.tsx client/services/smsService.ts sms-functions/functions/src/http/sendAnnouncement.js ADMIN_DASHBOARD.md push-parent-summons.bat deploy-announcement-function.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Announcements: summon a parent to the office with a one-SMS template" -m "Announce -> One Parent -> Summon to office: learner, date (next school day), time, Report to (Head, Deputy Head, Guidance office, form teacher), Sign as (Head / Deputy Head), optional call-back number. The template always fits one SMS (160 GSM-7 characters): long names are shortened step by step, smart punctuation and emoji are made plain, Send is blocked past one SMS. sendAnnouncement records category summons and refuses a summons to all parents." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01NnH9p72uUcX555gihYoFvd" >>"%LOG%" 2>&1
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
echo  STOPPED: could not commit. See push-parent-summons.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
