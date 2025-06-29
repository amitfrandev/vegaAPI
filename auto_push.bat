@echo off
setlocal EnableDelayedExpansion

:: Flag to track first run (no wait)
set FIRST_RUN=true

:LOOP
cls
echo ========================
echo Starting Git auto update
echo ========================

:: Timestamp for commit message
for /f %%a in ('powershell -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""' ) do set TIMESTAMP=%%a

:: Git add and commit
git add .
git commit -m "Auto update %TIMESTAMP%" > temp_commit_log.txt

:: Check if commit was successful
findstr /i "nothing to commit" temp_commit_log.txt >nul
if not errorlevel 1 (
    echo Nothing to commit. Skipping push.
) else (
    echo Committing done. Now pushing...
    git push > temp_push_log.txt

    :: Check push result
    findstr /i "Everything up-to-date" temp_push_log.txt >nul
    if not errorlevel 1 (
        echo Already up to date. Exiting loop.
        goto END
    )
)

:: Delay only after the first run
if "%FIRST_RUN%"=="true" (
    set FIRST_RUN=false
) else (
    echo Waiting 5 minutes before next check...
    timeout /t 300 /nobreak >nul
)

goto LOOP

:END
echo ========================
echo Git is up-to-date. Task complete.
echo ========================
del temp_commit_log.txt >nul 2>&1
del temp_push_log.txt >nul 2>&1
endlocal
