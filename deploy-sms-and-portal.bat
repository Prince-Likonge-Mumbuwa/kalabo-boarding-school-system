@echo off
rem ======================================================================
rem  Deploy: Parent Portal (portal) + all SMS functions + face functions
rem
rem  1. checks the live functions as they are NOW (before)
rem  2. saves Google's recent function logs (the reason they were failing)
rem  3. installs the packages and runs the self-tests
rem  4. deploys ONLY the functions listed below (the attendance triggers are
rem     not touched: src\attendance\triggers.js is missing, and a full
rem     deploy would offer to delete them)
rem  5. checks the live functions again (after)
rem
rem  Everything goes to deploy-sms-and-portal.log. Safe to run again.
rem  Sends no SMS and reads no parent's data.
rem ======================================================================
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%~dp0"
set "LOG=%ROOT%deploy-sms-and-portal.log"
set "PROJECT=catalyst-f1b1a"
set "FUNCTIONS_DISCOVERY_TIMEOUT=120"
set "ONLY=functions:portal,functions:sendSingleSms,functions:bulkSendSms,functions:sendAnnouncement,functions:getSmsHistory,functions:retrySms,functions:atDeliveryReportWebhook,functions:retryFailedSMSWorker,functions:faceSetConsent,functions:faceEnrol,functions:faceRevoke,functions:faceMatch,functions:faceAdmin,functions:faceSyncScheduled"

echo Deploy SMS + Parent Portal  %DATE% %TIME%> "%LOG%"
echo.
echo  Deploying the SMS and Parent Portal functions. Please leave this window open.
echo.

call :say "1/6 Checking Node.js, Firebase CLI and sign-in"
where node >>"%LOG%" 2>&1 || (call :fail "Node.js is not installed" & goto :end)
call firebase --version >>"%LOG%" 2>&1 || (call :fail "Firebase CLI not found (npm i -g firebase-tools)" & goto :end)
call firebase login:list >>"%LOG%" 2>&1
call firebase projects:list --non-interactive >>"%LOG%" 2>&1 || (call :fail "Firebase sign-in has expired: run  firebase login  then start this again" & goto :end)

call :say "2/6 Live functions BEFORE the deploy"
node scripts\check-live-functions.mjs >>"%LOG%" 2>&1
node scripts\check-live-functions.mjs

call :say "3/6 Saving Google's recent function logs (why they were failing)"
pushd "sms-functions"
call firebase functions:log --project %PROJECT% --lines 150 >>"%LOG%" 2>&1
popd
findstr /i /c:"billing" "%LOG%" >nul && (
  echo.
  echo  NOTE: the logs mention BILLING. If the deploy below fails, open
  echo  https://console.firebase.google.com/project/%PROJECT%/usage/details
  echo  with the project owner's account and check the Blaze plan / payment card.
  echo.
)

call :say "4/6 Installing the Cloud Functions packages and running the self-tests"
pushd "sms-functions\functions"
call npm install --no-audit --no-fund >>"%LOG%" 2>&1 || (popd & call :fail "npm install in sms-functions\functions failed" & goto :end)
call npm test >>"%LOG%" 2>&1 || (popd & call :fail "A self-test failed - nothing was deployed. See the log" & goto :end)
if not exist "src\portal\portalCore.cjs" (popd & call :fail "src\portal\portalCore.cjs is missing - run  npm run build:portal  in the app folder" & goto :end)
popd

call :say "5/6 Deploying (several minutes)"
pushd "sms-functions"
call firebase deploy --only %ONLY% --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
set "DEPLOY_ERR=%ERRORLEVEL%"
popd
if not "%DEPLOY_ERR%"=="0" (
  findstr /i /c:"billing" /c:"Blaze" "%LOG%" >nul && (call :fail "Google refused the deploy because of BILLING. The project owner must fix the Blaze plan / payment card in the Firebase console, then run this again" & goto :end)
  call :fail "Function deploy failed - see the end of deploy-sms-and-portal.log" & goto :end
)

call :say "6/6 Live functions AFTER the deploy"
rem Give the new versions a moment to start.
timeout /t 20 /nobreak >nul
node scripts\check-live-functions.mjs >>"%LOG%" 2>&1
node scripts\check-live-functions.mjs
if errorlevel 1 (call :fail "Deployed, but a live check failed - see the log" & goto :end)

echo ALL DONE>>"%LOG%"
echo.
echo  Done. Parent Portal, report-card SMS and announcements are live again.
echo  Test: send ONE learner's results SMS from Report Cards, and open the
echo  Parent Portal with a guardian number you know.
goto :end

:say
echo  %~1
echo.>>"%LOG%"
echo ==== %~1>>"%LOG%"
exit /b 0

:fail
echo.
echo  STOPPED: %~1
echo  See deploy-sms-and-portal.log
echo STOPPED: %~1>>"%LOG%"
exit /b 0

:end
echo.
pause
endlocal
