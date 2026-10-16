@echo off
rem ======================================================================
rem  Face recognition - deploy the Cloud Functions only
rem  (see FACE_RECOGNITION.md). Safe to run again.
rem  Progress and errors go to deploy-face-functions.log in this folder.
rem ======================================================================
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%~dp0"
set "LOG=%ROOT%deploy-face-functions.log"
set "PROJECT=catalyst-f1b1a"
set "TICK=C:\Users\MOGE\Desktop\tick-v4"
set "BRANCH=mnakwebwa-contribution"
set "FUNCS=functions:faceSetConsent,functions:faceEnrol,functions:faceRevoke,functions:faceMatch,functions:faceAdmin,functions:faceSyncScheduled"
rem Firebase loads the functions code to see what to deploy; antivirus
rem scanning can make that slower than its 10-second default.
set "FUNCTIONS_DISCOVERY_TIMEOUT=120"
set "KEYFILE=%TEMP%\kbs_face_key_%RANDOM%%RANDOM%.txt"

echo Face recognition setup  %DATE% %TIME%> "%LOG%"
echo.
echo  Deploying the face recognition functions for Kalabo Boarding Secondary.
echo  This takes about 5 minutes. Please leave this window open.
echo.

call :say "1/4 Checking Node.js, Firebase CLI and sign-in"
where node >>"%LOG%" 2>&1 || (call :fail "Node.js is not installed" & goto :end)
call firebase --version >>"%LOG%" 2>&1 || (call :fail "Firebase CLI not found (npm i -g firebase-tools)" & goto :end)
call firebase projects:list --non-interactive >>"%LOG%" 2>&1 || (call :fail "Firebase sign-in has expired: run  firebase login  then start this again" & goto :end)

call :say "2/4 Installing and testing the Cloud Functions"
pushd "sms-functions\functions"
call npm install --no-audit --no-fund >>"%LOG%" 2>&1 || (popd & call :fail "npm install in sms-functions\functions failed" & goto :end)
call npm test >>"%LOG%" 2>&1 || (popd & call :fail "Face function tests failed - nothing was deployed" & goto :end)
popd

call :say "3/4 Setting FACE_TEMPLATE_KEY from Tick's TEMPLATE_KEY"
pushd "sms-functions"
call firebase functions:secrets:get FACE_TEMPLATE_KEY --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
set "HAVE_SECRET=%ERRORLEVEL%"
popd
if "%HAVE_SECRET%"=="0" (
  call :say "   FACE_TEMPLATE_KEY already set - kept as it is"
  goto :deploy_start
)
node "%ROOT%setup-face-key.mjs" "%TICK%" "%KEYFILE%" >>"%LOG%" 2>&1 || (call :fail "Could not read Tick's TEMPLATE_KEY" & goto :end)
pushd "sms-functions"
call firebase functions:secrets:set FACE_TEMPLATE_KEY --data-file "%KEYFILE%" --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
set "SECRET_ERR=%ERRORLEVEL%"
popd
del /f /q "%KEYFILE%" >nul 2>&1
if not "%SECRET_ERR%"=="0" (call :fail "Setting the secret failed - see the log" & goto :end)

:deploy_start

call :say "4/4 Deploying the face recognition Cloud Functions (several minutes)"
echo ---- deploy>>"%LOG%"
pushd "sms-functions"
call firebase deploy --only %FUNCS% --project %PROJECT% --non-interactive >>"%LOG%" 2>&1
set "DEPLOY_ERR=%ERRORLEVEL%"
popd
if not "%DEPLOY_ERR%"=="0" (call :fail "Function deploy failed - see the log" & goto :end)

:done
echo.>>"%LOG%"
echo ALL DONE>>"%LOG%"
echo.
echo  ===============================================================
echo   Done. The face recognition Cloud Functions are deployed.
echo   Details: deploy-face-functions.log
echo  ===============================================================
goto :end

:say
echo  %~1
echo.>>"%LOG%"
echo ==== %~1>>"%LOG%"
exit /b 0

:fail
echo.
echo  STOPPED: %~1
echo  See deploy-face-functions.log
echo.>>"%LOG%"
echo STOPPED: %~1>>"%LOG%"
exit /b 0

:end
if exist "%KEYFILE%" del /f /q "%KEYFILE%" >nul 2>&1
echo.
pause
endlocal
