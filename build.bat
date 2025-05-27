@echo off
echo Start building...

:: Generate a random number (between 0-32767), you can combine two for a longer number
set /a RAND1=%RANDOM%
set /a RAND2=%RANDOM%
set "RANDOM_ID=daily_update_%RAND1%%RAND2%"

echo Generated ID: %RANDOM_ID%

@REM echo Get Latest Updated movies ...
@REM node src/cli/update.js

echo fetch movies ...
node src/cli/update.js

echo Fetch Categories if db have no categories ...
node src/cli/fetch-categories.js

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
