@echo off
rem ======================================================================
rem  Deploy the results-SMS fix (sendSingleSms + bulkSendSms only).
rem  Only these two functions use lib\messageFormatter.js, so nothing else
rem  is touched. The attendance functions are deliberately NOT included:
rem  src\attendance\triggers.js is missing, and a full deploy would offer
rem  to delete them. Safe to run again.
rem  Progress and errors go to deploy-sms-results-fix.log
rem ======================================================================
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%~dp0"
set "LOG=%ROOT%deploy-sms-results-fix.log"
set "PROJECT=catalyst-f1b1a"
rem Firebase gives up reading the code after 10 s by default; allow 2 minutes.
set "FUNCTIONS_DISCOVERY_TIMEOUT=120"
set "KEYFILE=%TEMP%\kbs_dlr_token_%RANDOM%%RANDOM%.txt"

echo Deploy results-SMS fix  %DATE% %TIME%> "%LOG%"
echo.
echo  Deploying the results SMS fix. Please leave this window open.
echo.

call :say "1/4 Checking Node.js, Firebase CLI and sign-in"
where node >>"%LOG%" 2>&1 || (call :fail "Node.js is not installed" & goto :end)
call firebase --version >>"%LOG%" 2>&1 || (call :fail "Firebase CLI not found (npm i -g firebase-tools)" & goto :end)
call firebase projects:list --non-interactive >>"%LOG%" 2>&1 || (call :fail "Firebase sign-in has expired: run  firebase login  then start this again" & goto :end)

call :say "2/4 Installing the Cloud Functions packages"
pushd "sms-functions\functions"
call npm install --no-audit --no-fund >>"%LOG%" 2>&1 || (popd & call :fail "npm install in sms-functions\functions failed" & goto :end)
popd

call :say "3/4 Delivery-report secret (AT_WEBHOOK_TOKEN) - Firebase needs it to exist"
pushd "sms-functions"
call firebase functions:secrets:get AT_WEBHOOK_TOKEN --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
if errorlevel 1 (
  node -e "require('fs').writeFileSync(process.argv[1], require('crypto').randomBytes(24).toString('hex'))" "%KEYFILE%" || (popd & call :fail "Could not create the secret" & goto :end)
  call firebase functions:secrets:set AT_WEBHOOK_TOKEN --data-file "%KEYFILE%" --project %PROJECT% --non-interactive >>"%LOG%" 2>&1 || (popd & del "%KEYFILE%" 2>nul & call :fail "Setting the secret failed - see the log" & goto :end)
  del "%KEYFILE%" 2>nul
  echo   New secret created.
) else (
  echo   Secret already set - kept as it is.
)
popd

call :say "4/4 Deploying sendSingleSms and bulkSendSms (a few minutes)"
pushd "sms-functions"
call firebase deploy --only functions:sendSingleSms,functions:bulkSendSms --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
set "DEPLOY_ERR=%ERRORLEVEL%"
popd
if not "%DEPLOY_ERR%"=="0" (call :fail "Function deploy failed - see the log" & goto :end)

echo ALL DONE>>"%LOG%"
echo.
echo  Done. Results SMS now average Week 4, Week 8 and End of Term.
echo  Test with ONE learner and compare with the report card before sending to a class.
goto :end

:say
echo  %~1
echo.>>"%LOG%"
echo ==== %~1>>"%LOG%"
exit /b 0

:fail
echo.
echo  STOPPED: %~1
echo  See deploy-sms-results-fix.log
echo STOPPED: %~1>>"%LOG%"
exit /b 0

:end
echo.
pause
endlocal
