@echo off
setlocal

:: Set working directory to the script's location
cd /d %~dp0

:: Timestamp for logs and commit message
for /f %%a in ('powershell -command "Get-Date -Format \"yyyy-MM-dd_HH-mm-ss\""') do set "TIMESTAMP=%%a"

:: Generate a random ID
set /a RAND1=%RANDOM%
set /a RAND2=%RANDOM%
set "RANDOM_ID=daily_update_%RAND1%%RAND2%_%TIMESTAMP%"

:: Log file
set "LOG_FILE=logs\%RANDOM_ID%.log"
if not exist logs mkdir logs

:: Function to print a header message
call :printHeader "🛠 Starting Build: %RANDOM_ID%"

call :run "Fetching movies..."                 "node src/cli/update.js"
call :run "Fetching categories if missing..."  "node src/cli/fetch-categories.js"
call :run "Updating tags in local database..." "node src/cli/generate-categories-tag-fetcher.js"
call :run "Exporting database to JSON..."      "node src/cli/db-to-json.js"

call :run "Adding files to git..."             "git add ."
call :run "Committing to git..."               "git commit -m \"%RANDOM_ID%\""
call :run "Pushing to git..."                  "git push"

call :printHeader "✅ Build Complete!"

exit /b

:: ------------ Helper functions ------------

:run
echo.
echo === %~1
echo %~2 >> "%LOG_FILE%" 2>&1
%~2 >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo ❌ Failed: %~1 (Check %LOG_FILE%)
    exit /b 1
)
goto :eof

:printHeader
echo.
echo ==================================================
echo %~1
echo ==================================================
goto :eof
