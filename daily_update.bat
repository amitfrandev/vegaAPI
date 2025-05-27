@echo off
setlocal

:: Set working directory to the script's location
cd /d %~dp0

:: Generate a daily update ID using the current date
for /f %%a in ('powershell -command "Get-Date -Format \"yyyy-MM-dd\""') do set "DATE_ID=%%a"
set "RANDOM_ID=daily_update_%DATE_ID%"

:: Set log file path
if not exist logs mkdir logs
set "LOG_FILE=logs\%RANDOM_ID%.log"

:: Print start header
call :printHeader "🛠 Starting Build: %RANDOM_ID%"

:: Run steps
call :run "Fetching movies..."                 "node src/cli/update.js"
call :run "Fetching categories if missing..."  "node src/cli/fetch-categories.js"
call :run "Updating tags in local database..." "node src/cli/generate-categories-tag-fetcher.js"
call :run "Exporting database to JSON..."      "node src/cli/db-to-json.js"

call :run "Adding files to git..."             "git add ."
call :run "Committing to git..."               "git commit -m \"%RANDOM_ID%\""
call :run "Pushing to git..."                  "git push"

:: Print finish header
call :printHeader "✅ Build Complete!"

:: Save to summary log
echo [%DATE% %TIME%] %RANDOM_ID% >> logs\daily-updates-log.txt

exit /b

:: ------------ Helper functions ------------

:run
echo.
echo === %~1
echo [%DATE% %TIME%] %~1 >> "%LOG_FILE%" 2>&1
echo %~2 >> "%LOG_FILE%" 2>&1
%~2 >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    powershell -Command "Write-Host '❌ Failed: %~1 (Check %LOG_FILE%)' -ForegroundColor Red"
    exit /b 1
) else (
    powershell -Command "Write-Host '✔ Success: %~1' -ForegroundColor Green"
)
goto :eof

:printHeader
powershell -Command "Write-Host '==================================================' -ForegroundColor Yellow"
powershell -Command "Write-Host '%~1' -ForegroundColor Yellow"
powershell -Command "Write-Host '==================================================' -ForegroundColor Yellow"
goto :eof
