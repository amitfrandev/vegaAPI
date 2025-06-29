@echo off
setlocal EnableDelayedExpansion

echo ========================
echo Start building...

:: Generate a random ID
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
git commit -m "%RANDOM_ID%"

echo Push to git...
git push

echo Build complete!
echo ========================
