@echo off
rem Copies the AI server's saved data and settings from this PC to the server:
rem   ai-server\storage  (curriculum PDFs, search index, eFiles, scans, superAdmin)
rem   ai-server\.env     (keys and settings; sent over SSH, which is encrypted)
rem On the server, deploy/receive-storage.sh pauses the AI server, unpacks them,
rem sets CLIENT_ORIGIN to the live website and starts the server again.
rem
rem Works for both kinds of server:
rem   Oracle Cloud:  user "ubuntu", signs in with the key file Oracle gave you
rem                  (kept at %USERPROFILE%\.ssh\oracle-ai.key, as the guide says)
rem   Hostinger:     user "root", signs in with the root password (no key file)
rem
rem Before running: close the AI server on this PC (the "npm run dev" window),
rem so the search index is not being written while it is copied.
rem Windows 10 and 11 already include tar, scp and ssh.
setlocal EnableExtensions
cd /d "%~dp0..\.."
if not exist "ai-server\storage" (echo  ai-server\storage was not found. Nothing was sent. & pause & exit /b 1)

set /p VPS=Server address (its public IP address):
if "%VPS%"=="" (echo  No address given. Nothing was sent. & pause & exit /b 1)

set "USR=ubuntu"
set /p USR=User name [ubuntu for Oracle, root for Hostinger]:

set "KEY=%USERPROFILE%\.ssh\oracle-ai.key"
set "KEYOPT="
if exist "%KEY%" (
  set "KEYOPT=-i "%KEY%""
  echo  Signing in with the key file %KEY%
) else (
  echo  No key file at %KEY%, so it will ask for the password.
)

set "PACK=%TEMP%\ai-storage.tar.gz"
echo.
echo  1/3 Packing ai-server\storage and ai-server\.env ...
tar -czf "%PACK%" --exclude=*.tmp -C ai-server storage .env || (echo  Packing failed. & pause & exit /b 1)

echo  2/3 Sending to the server ...
scp %KEYOPT% "%PACK%" %USR%@%VPS%:/tmp/ai-storage.tar.gz || (echo  Sending failed. & pause & exit /b 1)

echo  3/3 Unpacking on the server and restarting the AI server ...
ssh %KEYOPT% %USR%@%VPS% "sudo bash /opt/catalyst/ai-server/deploy/receive-storage.sh /tmp/ai-storage.tar.gz" || (echo  Unpacking failed. The data was sent but not used yet. & pause & exit /b 1)

del "%PACK%" >nul 2>&1
echo.
echo  Done. Open https://ai.kalaboboarding.com/api/health to check.
pause
endlocal
