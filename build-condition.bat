@echo off
setlocal EnableDelayedExpansion

:LOOP
cls
echo ========================
echo Start building...

:: Generate a random commit ID
set /a RAND1=%RANDOM%
set /a RAND2=%RANDOM%
set "RANDOM_ID=daily_update_%RAND1%%RAND2%"

echo Generated ID: %RANDOM_ID%

echo Update tags in local database...
node src/cli/generate-categories-tag-fetcher.js

echo Export database to JSON...
node src/cli/db-to-json.js

echo Add to git...
git add .

echo Commit to git with ID: %RANDOM_ID%
git commit -m "%RANDOM_ID%" > temp_commit_log.txt

:: Check if commit was successful
findstr /i "nothing to commit" temp_commit_log.txt >nul
if not errorlevel 1 (
    echo Nothing to commit. Skipping push.
    goto CHECK_STOP
)

echo Committing done. Now pushing...
git push > temp_push_log.txt

:CHECK_STOP
:: Check if push was already up-to-date
findstr /i "Everything up-to-date" temp_push_log.txt >nul
if not errorlevel 1 (
    echo Already up to date. Stopping loop.
    goto END
)

:: Wait for 5 minutes
echo Waiting 5 minutes before next run...
timeout /t 300 /nobreak >nul
goto LOOP

:END
echo ========================
echo Git is up-to-date. Task complete.
echo ========================
del temp_commit_log.txt >nul 2>&1
del temp_push_log.txt >nul 2>&1
endlocal
