@echo off
setlocal enabledelayedexpansion

REM One-click installer for Android emulator (Windows).
REM 1) Builds debug APK via Gradle
REM 2) Installs APK on running emulator via adb

set "SCRIPT_DIR=%~dp0"
set "ANDROID_DIR=%SCRIPT_DIR%android"

if not exist "%ANDROID_DIR%\gradlew.bat" (
  echo [ERROR] gradlew.bat not found in "%ANDROID_DIR%"
  echo Open project root and run this file from softale-mobile folder.
  pause
  exit /b 1
)

if exist "%ProgramFiles%\Android\Android Studio\jbr" (
  set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
) else if exist "%ProgramFiles(x86)%\Android\Android Studio\jbr" (
  set "JAVA_HOME=%ProgramFiles(x86)%\Android\Android Studio\jbr"
)

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [ERROR] JAVA_HOME is not set correctly.
  echo Expected java at: "%JAVA_HOME%\bin\java.exe"
  echo Install Android Studio (with bundled JBR) or set JAVA_HOME manually.
  pause
  exit /b 1
)

set "ADB_EXE=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not exist "%ADB_EXE%" (
  set "ADB_EXE=%ANDROID_HOME%\platform-tools\adb.exe"
)
if not exist "%ADB_EXE%" (
  echo [ERROR] adb.exe not found.
  echo Expected: "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
  pause
  exit /b 1
)

echo.
echo [1/4] Checking emulator device...
"%ADB_EXE%" devices | findstr /R "emulator-[0-9][0-9][0-9][0-9][[:space:]]device" >nul
if errorlevel 1 (
  echo [ERROR] No running emulator found.
  echo Start Android Emulator first, then run this installer again.
  pause
  exit /b 1
)

echo [2/4] Building debug APK...
pushd "%ANDROID_DIR%"
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo [ERROR] Build failed.
  popd
  pause
  exit /b 1
)
popd

set "APK_PATH=%ANDROID_DIR%\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK_PATH%" (
  echo [ERROR] APK not found: "%APK_PATH%"
  pause
  exit /b 1
)

echo [3/4] Installing APK to emulator...
"%ADB_EXE%" install -r "%APK_PATH%"
if errorlevel 1 (
  echo [ERROR] APK install failed.
  pause
  exit /b 1
)

echo [4/4] Done. App installed successfully.
echo App name: SofTale RPG
echo Package: com.softale.rpg
echo.
echo If icon is not updated, remove old app from emulator and run installer again.
pause
exit /b 0
