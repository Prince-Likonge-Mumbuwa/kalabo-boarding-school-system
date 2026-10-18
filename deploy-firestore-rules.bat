@echo off
rem ======================================================================
rem  Deploy the Firestore security rules only (firestore.rules).
rem  Needed for: Heads of Department (adding teachers, class allocations)
rem  and for stopping teachers from changing their own departments.
rem  Safe to run again. Log: deploy-firestore-rules.log
rem ======================================================================
setlocal EnableExtensions
cd /d "%~dp0"
set "LOG=%~dp0deploy-firestore-rules.log"
set "PROJECT=catalyst-f1b1a"
echo Firestore rules deploy  %DATE% %TIME%> "%LOG%"
echo.
echo  Deploying the Firestore security rules for Kalabo Boarding Secondary...
echo.
call firebase --version >>"%LOG%" 2>&1 || (echo  STOPPED: Firebase CLI not found ^(npm i -g firebase-tools^) & goto :end)
call firebase projects:list --non-interactive >>"%LOG%" 2>&1 || (echo  STOPPED: Firebase sign-in has expired: run  firebase login  then start this again & goto :end)
call firebase deploy --only firestore:rules --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
if errorlevel 1 (echo  STOPPED: the rules were not deployed - see deploy-firestore-rules.log & goto :end)
echo ALL DONE>>"%LOG%"
echo  Done. The new Firestore rules are live.
:end
echo.
pause
endlocal
