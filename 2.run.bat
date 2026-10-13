@echo off
setlocal
cd /d "%~dp0"

set JAVA_HOME=C:\DevEnv\jdk1.8.0_131
set PATH=%JAVA_HOME%\bin;%PATH%

if not exist bin\AppServer.class (
    echo [錯誤] 找不到 bin\AppServer.class，請先執行 build.bat！
    pause
    exit /b
)

echo Starting ProjectBook Server on Port 8080...
java -Xms256m -Xmx1024m -XX:+UseG1GC -cp "bin;lib/*" AppServer
pause