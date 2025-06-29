@echo off
echo Start building...

:: Generate a random number (between 0-32767), you can combine two for a longer number
set /a RAND1=%RANDOM%
set /a RAND2=%RANDOM%
set "RANDOM_ID=daily_update_%RAND1%%RAND2%"

echo Generated ID: %RANDOM_ID%

:: Ask if update.js should run
:ASK_UPDATE
set /p RUN_UPDATE="Do you want to fetch movies using update.js? (yes/y or no/n): "
if /i "%RUN_UPDATE%"=="yes" goto UPDATE
if /i "%RUN_UPDATE%"=="y" goto UPDATE
if /i "%RUN_UPDATE%"=="no" goto SKIP_UPDATE
if /i "%RUN_UPDATE%"=="n" goto SKIP_UPDATE

echo Invalid input. Please type yes/y or no/n.
goto ASK_UPDATE

:UPDATE
echo Fetching movies...
node src/cli/update.js
goto CONTINUE

:SKIP_UPDATE
echo Skipped update.js

:CONTINUE
echo Fetch Categories if db has no categories ...
node src/cli/fetch-categories.js

echo Update tags in local database...
node src/cli/generate-categories-tag-fetcher.js

echo Export database to JSON...
node src/cli/db-to-json.js

echo Add to git...
git add .

echo Commit to git with ID: %RANDOM_ID%
git commit -m "%RANDOM_ID%"

:: Ask for confirmation before pushing
:ASK_PUSH
set /p PUSH_CONFIRM="Do you want to push to git? (yes/y or no/n): "
if /i "%PUSH_CONFIRM%"=="yes" goto PUSH
if /i "%PUSH_CONFIRM%"=="y" goto PUSH
if /i "%PUSH_CONFIRM%"=="no" goto END
if /i "%PUSH_CONFIRM%"=="n" goto END

echo Invalid input. Please type yes/y or no/n.
goto ASK_PUSH

:PUSH
echo Pushing to git...
git push
goto DONE

:END
echo Skipped pushing to git.

:DONE
echo Build complete!
