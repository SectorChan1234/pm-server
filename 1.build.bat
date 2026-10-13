@echo off
setlocal
cd /d "%~dp0"

set JAVA_HOME=C:\Program Files\Java\jdk1.8.0_131
set PATH=%JAVA_HOME%\bin;%PATH%

echo [1/2] Preparing output directories...
if not exist bin mkdir bin

echo [2/2] Compiling all modules with JDK 8 (u131)...
javac -encoding UTF-8 -cp "src;bin;lib/*" -d bin src/common/*.java src/handlers/*.java src/AppServer.java

if %ERRORLEVEL% equ 0 (
    echo ===========================================
    echo Build SUCCESS! Run 'run.bat' to start.
    echo ===========================================
) else (
    echo ===========================================
    echo Build FAILED! Please check error output.
    echo ===========================================
)
pause