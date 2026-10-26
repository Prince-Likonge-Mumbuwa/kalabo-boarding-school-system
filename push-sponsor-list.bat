@echo off
rem Commit the school sponsor list (KGS, CAMFED, CDF, AP, WISE; others are
rem Self-sponsored), push to mnakwebwa-contribution, then deploy the
rem Firestore rules (guidance officers may save the sponsor list).
rem Output: push-sponsor-list.log
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0push-sponsor-list.log"
set "BRANCH=mnakwebwa-contribution"
set "PROJECT=catalyst-f1b1a"
echo Push sponsor list  %DATE% %TIME%> "%LOG%"
echo.
echo  Saving the sponsor list to GitHub and deploying the rules...
echo.

for /f %%b in ('git rev-parse --abbrev-ref HEAD') do set "CUR=%%b"
echo Current branch: %CUR%>>"%LOG%"
if /i not "%CUR%"=="%BRANCH%" goto :wrongbranch

echo ==== catch up with GitHub>>"%LOG%"
git fetch origin>>"%LOG%" 2>&1
git merge --ff-only origin/%BRANCH%>>"%LOG%" 2>&1
if errorlevel 1 goto :failed

git add -- client/components/guidance/SponsorListTab.tsx client/components/guidance/SponsorSelect.spec.tsx client/components/guidance/SponsorSelect.tsx client/hooks/useSponsorList.ts client/services/sponsorListService.spec.ts client/services/sponsorListService.ts GUIDANCE.md client/components/EditLearnerModal.tsx client/components/IndividualLearnerModal.tsx client/components/admissions/AdmissionsWorkspace.tsx client/components/guidance/GuidanceWorkspace.spec.tsx client/components/guidance/GuidanceWorkspace.tsx client/services/guidancePlan.spec.ts client/services/guidancePlan.ts firestore-tests/guidance.rules.emulator.ts firestore.rules push-sponsor-list.bat >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== staged>>"%LOG%"
git diff --cached --stat>>"%LOG%" 2>&1

git commit -m "Guidance: one sponsor list (KGS, CAMFED, CDF, AP, WISE); anyone else is Self-sponsored" -m "A learner is sponsored only by a sponsor on the school's list (case, spaces and punctuation ignored); a parent's name, Self, blank or anything else counts as Self-sponsored. Guidance officers (and the admin) keep the list in a new Sponsor list tab: add or remove a sponsor, see the other names typed as sponsor and add one or mark it as a spelling of a listed sponsor, and tidy current learners' records (listed spelling to its name, everything else to Self-sponsored) after a preview." -m "Learner forms (add, edit, admissions) choose the sponsor from the list; CSV imports are matched the same way. Firestore rules: guidance officers may save system/sponsors (only its fields, in their own name)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01DgMgBZ459HqvJRafDCVkZU" >>"%LOG%" 2>&1
if errorlevel 1 goto :failed

echo ==== push>>"%LOG%"
git push origin %BRANCH% >>"%LOG%" 2>&1
if errorlevel 1 goto :pushfailed
git log -1 --oneline>>"%LOG%" 2>&1

echo ==== deploy rules>>"%LOG%"
call firebase deploy --only firestore:rules --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
if errorlevel 1 goto :rulesfailed

echo ==== status after>>"%LOG%"
git status --short>>"%LOG%" 2>&1
echo ALL DONE>>"%LOG%"
echo  Done. Pushed to %BRANCH% and the rules are live.
goto :end

:wrongbranch
echo STOPPED: on branch %CUR%, not %BRANCH%>>"%LOG%"
echo  STOPPED: you are on branch %CUR%, not %BRANCH%. Nothing was changed.
goto :end

:failed
echo STOPPED: git update/add/commit failed>>"%LOG%"
echo  STOPPED: could not commit. See push-sponsor-list.log
goto :end

:pushfailed
echo STOPPED: push failed - the commit is saved locally>>"%LOG%"
echo  STOPPED: the push failed; the commit is saved on this computer.
goto :end

:rulesfailed
echo STOPPED: pushed, but the rules deploy failed>>"%LOG%"
echo  Pushed, but the rules were not deployed. Run deploy-firestore-rules.bat. See push-sponsor-list.log
goto :end

:end
echo.
timeout /t 8 >nul
endlocal
