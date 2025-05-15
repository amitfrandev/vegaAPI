@echo off
echo Building API for Vercel deployment...

:: Create api directory if it doesn't exist
if not exist api mkdir api

:: Copy the database to api folder
if not exist api\output mkdir api\output
if not exist api\output\db mkdir api\output\db
copy output\db\movies.db api\output\db\movies.db /Y

echo Build complete! 