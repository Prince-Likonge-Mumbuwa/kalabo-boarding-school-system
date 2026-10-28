@echo off
rem ======================================================================
rem  Deploy the sendAnnouncement Cloud Function only (parent summons:
rem  records category = summons). Safe to run again.
rem  Progress and errors go to deploy-announcement-function.log
rem ======================================================================
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%~dp0"
set "LOG=%ROOT%deploy-announcement-function.log"
set "PROJECT=catalyst-f1b1a"
set "FUNCTIONS_DISCOVERY_TIMEOUT=120"

echo Deploy sendAnnouncement  %DATE% %TIME%> "%LOG%"
echo.
echo  Deploying the announcement SMS function. Please leave this window open.
echo.

call :say "1/3 Checking Node.js, Firebase CLI and sign-in"
where node >>"%LOG%" 2>&1 || (call :fail "Node.js is not installed" & goto :end)
call firebase --version >>"%LOG%" 2>&1 || (call :fail "Firebase CLI not found (npm i -g firebase-tools)" & goto :end)
call firebase projects:list --non-interactive >>"%LOG%" 2>&1 || (call :fail "Firebase sign-in has expired: run  firebase login  then start this again" & goto :end)

call :say "2/3 Installing the Cloud Functions packages"
pushd "sms-functions\functions"
call npm install --no-audit --no-fund >>"%LOG%" 2>&1 || (popd & call :fail "npm install in sms-functions\functions failed" & goto :end)
popd

call :say "3/3 Deploying sendAnnouncement (a few minutes)"
pushd "sms-functions"
call firebase deploy --only functions:sendAnnouncement --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
set "DEPLOY_ERR=%ERRORLEVEL%"
popd
if not "%DEPLOY_ERR%"=="0" (call :fail "Function deploy failed - see the log" & goto :end)

echo ALL DONE>>"%LOG%"
echo.
echo  Done. sendAnnouncement is deployed.
goto :end

:say
echo  %~1
echo.>>"%LOG%"
echo ==== %~1>>"%LOG%"
exit /b 0

:fail
echo.
echo  STOPPED: %~1
echo  See deploy-announcement-function.log
echo STOPPED: %~1>>"%LOG%"
exit /b 0

:end
echo.
pause
endlocal
