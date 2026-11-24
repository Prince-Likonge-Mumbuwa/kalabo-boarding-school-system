@echo off
rem Copies the server's newest nightly backup (made at 02:30 by backup.sh) to
rem this PC, into Documents\catalyst-backups. Run it about once a week, so a
rem copy of the teachers' eFiles and the search index is kept off the server.
rem
rem The backup holds ai-server\storage and ai-server\.env (the API keys), so it
rem is saved outside the project folder, where git can never pick it up.
rem To use one, see "Restoring a backup" in DEPLOY_AI_SERVER.md.
rem
rem Oracle Cloud: user "ubuntu" and the key file at %USERPROFILE%\.ssh\oracle-ai.key
rem Hostinger:    user "root" and the root password
setlocal EnableExtensions

set /p VPS=Server address (its public IP address):
if "%VPS%"=="" (echo  No address given. & pause & exit /b 1)
set "USR=ubuntu"
set /p USR=User name [ubuntu for Oracle, root for Hostinger]:

set "KEY=%USERPROFILE%\.ssh\oracle-ai.key"
set "KEYOPT="
if exist "%KEY%" set "KEYOPT=-i "%KEY%""

set "DEST=%USERPROFILE%\Documents\catalyst-backups"
if not exist "%DEST%" mkdir "%DEST%"
rem Ask the server for the newest backup's name, e.g. ai-storage-2026-11-20.tar.gz
set "NAME="
for /f "delims=" %%N in ('ssh %KEYOPT% %USR%@%VPS% "sudo sh -c 'ls -1t /opt/catalyst-backups/ai-storage-*.tar.gz 2>/dev/null | head -1 | xargs -r basename'"') do set "NAME=%%N"
if "%NAME%"=="" (echo  No backup on the server yet. The first one is made at 02:30. & pause & exit /b 1)
set "OUT=%DEST%\%NAME%"

echo  Downloading %NAME% ...
ssh %KEYOPT% %USR%@%VPS% "sudo cat /opt/catalyst-backups/%NAME%" > "%OUT%" || (echo  Download failed. & del "%OUT%" >nul 2>&1 & pause & exit /b 1)

for %%F in ("%OUT%") do if %%~zF LSS 1000 (echo  The download is empty. & del "%OUT%" & pause & exit /b 1)
for %%F in ("%OUT%") do echo  Saved %%~nxF  (%%~zF bytes) in %DEST%
pause
endlocal
