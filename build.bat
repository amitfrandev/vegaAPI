@echo off
echo Building API for Vercel deployment...

:: Run the database to update local db script first
echo Exporting database to JSON...
node src/cli/update.js

:: Run the database export script first
echo Exporting database to JSON...
node src\cli\db-to-json.js

:: Run the cross-platform build preparation script
echo Running build preparation script...
node scripts\prepare-build.js

echo Build complete! 