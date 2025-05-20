@echo off
echo Building API for Vercel deployment...

echo Updating new added movies...
node src/cli/update.js

echo Generate local category sitemap...
node src/cli/generate-category-sitemap.js

echo Updating tags in local database...
node src/cli/tag-category-inserter.js

::  Run the database to update local db script first
echo Exporting database to JSON...
node src/cli/update.js

:: Run the database export script first
echo Exporting database to JSON...
node src\cli\db-to-json.js

:: Run the cross-platform build preparation script
echo Running build preparation script...
node scripts\prepare-build.js

echo add to git 
git add .

echo commit to git 
git commit -m "update"

echo push to git 
git push

echo Build complete! 