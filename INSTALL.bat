@echo off
setlocal enabledelayedexpansion
title Damri Tracking - Installer
color 0A

echo.
echo  ================================================
echo     DAMRI PESISIR SELATAN - LIVE TRACKING
echo              Proses Instalasi
echo  ================================================
echo.

:: -- Cek hak akses Administrator --
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [X] Script ini harus dijalankan sebagai Administrator!
    echo  [X] Klik kanan INSTALL.bat -^> "Run as administrator"
    echo.
    pause
    exit /b 1
)

:: -- Tentukan direktori kerja --
set "WORK_DIR=%~dp0"
cd /d "%WORK_DIR%"
echo  [OK] Direktori kerja: %WORK_DIR%
echo.

:: ================================================================
:: LANGKAH 1: CEK / INSTALL NODE.JS
:: ================================================================
echo  [1/5] Memeriksa Node.js...
node --version >nul 2>&1
if %errorLevel% equ 0 (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
    echo  [OK] Node.js sudah terinstall: !NODE_VER!
) else (
    echo  [INFO] Node.js belum ada. Mengunduh installer...
    echo         Ini mungkin butuh beberapa menit tergantung koneksi internet.
    echo.

    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\node-installer.msi' -UseBasicParsing }"

    if not exist "%TEMP%\node-installer.msi" (
        echo  [X] Gagal mengunduh Node.js. Periksa koneksi internet.
        echo  [X] Download manual di: https://nodejs.org
        pause
        exit /b 1
    )

    echo  [INFO] Menginstall Node.js (proses otomatis, harap tunggu)...
    msiexec /i "%TEMP%\node-installer.msi" /qn /norestart ADDLOCAL=ALL

    call RefreshEnv.cmd >nul 2>&1
    set "PATH=%PATH%;C:\Program Files\nodejs"

    node --version >nul 2>&1
    if %errorLevel% neq 0 (
        echo  [X] Instalasi Node.js gagal.
        echo  [X] Coba install manual dari https://nodejs.org lalu jalankan ulang.
        pause
        exit /b 1
    )
    echo  [OK] Node.js berhasil diinstall!
)

:: ================================================================
:: LANGKAH 2: CEK / INSTALL POSTGRESQL
:: ================================================================
echo.
echo  [2/5] Memeriksa PostgreSQL...

set "PSQL_PATH="
for %%p in (
    "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
    "C:\Program Files\PostgreSQL\17\bin\psql.exe"
) do (
    if exist %%p (
        set "PSQL_PATH=%%~p"
        goto :psql_found
    )
)

:psql_not_found
echo  [INFO] PostgreSQL belum ada. Mengunduh installer...
echo         Ini mungkin butuh beberapa menit.
echo.

powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1258893' -OutFile '%TEMP%\pg-installer.exe' -UseBasicParsing }"

if not exist "%TEMP%\pg-installer.exe" (
    echo  [X] Gagal mengunduh PostgreSQL. Periksa koneksi internet.
    echo  [X] Download manual di: https://www.postgresql.org/download/windows/
    pause
    exit /b 1
)

echo  [INFO] Menginstall PostgreSQL (proses otomatis, harap tunggu ~2 menit)...
"%TEMP%\pg-installer.exe" --mode unattended --unattendedmodeui none --superpassword "damri2025pg" --servicename "postgresql-damri" --serverport 5432

for %%p in (
    "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
    "C:\Program Files\PostgreSQL\17\bin\psql.exe"
) do (
    if exist %%p (
        set "PSQL_PATH=%%~p"
        goto :psql_found
    )
)

echo  [X] Instalasi PostgreSQL gagal atau tidak ditemukan.
pause
exit /b 1

:psql_found
for %%F in ("%PSQL_PATH%") do set "PG_BIN=%%~dpF"
set "PATH=%PATH%;%PG_BIN%"
echo  [OK] PostgreSQL ditemukan: %PSQL_PATH%

:: ================================================================
:: LANGKAH 3: BUAT DATABASE and JALANKAN SCHEMA
:: ================================================================
echo.
echo  [3/5] Menyiapkan database...

"%PSQL_PATH%" -U postgres -c "SELECT 1 FROM pg_database WHERE datname='tracking_db'" 2>nul | find "1 row" >nul
if %errorLevel% equ 0 (
    echo  [OK] Database tracking_db sudah ada, melewati pembuatan.
    goto :db_ready
)

echo  [INFO] Membuat database tracking_db...
"%PSQL_PATH%" -U postgres -c "CREATE DATABASE tracking_db;" 2>nul
if %errorLevel% neq 0 (
    echo  [X] Gagal membuat database. Cek password PostgreSQL.
    pause
    exit /b 1
)

if exist "%WORK_DIR%db\schema.sql" (
    echo  [INFO] Menjalankan schema.sql...
    "%PSQL_PATH%" -U postgres -d tracking_db -f "%WORK_DIR%db\schema.sql"
    echo  [OK] Schema berhasil dibuat.
) else (
    echo  [X] File db\schema.sql tidak ditemukan!
    pause
    exit /b 1
)

if exist "%WORK_DIR%db\seed.sql" (
    echo  [INFO] Mengisi data awal (seed.sql)...
    "%PSQL_PATH%" -U postgres -d tracking_db -f "%WORK_DIR%db\seed.sql"
    echo  [OK] Data awal berhasil dimasukkan.
)

:db_ready

:: ================================================================
:: LANGKAH 4: BUAT FILE .ENV
:: ================================================================
echo.
echo  [4/5] Membuat file konfigurasi .env...

if exist "%WORK_DIR%.env" (
    echo  [OK] File .env sudah ada, tidak ditimpa.
) else (
    (
        echo DATABASE_URL=postgresql://postgres:damri2025pg@localhost:5432/tracking_db
        echo PORT=3000
        echo NODE_ENV=production
    ) > "%WORK_DIR%.env"
    echo  [OK] File .env berhasil dibuat.
)

:: ================================================================
:: LANGKAH 5: INSTALL DEPENDENCIES NPM
:: ================================================================
echo.
echo  [5/5] Menginstall dependensi Node.js (npm install)...
echo        Harap tunggu, ini butuh 1-3 menit pertama kali...
echo.

cd /d "%WORK_DIR%"
npm install --omit=dev

if %errorLevel% neq 0 (
    echo  [X] npm install gagal. Periksa koneksi internet.
    pause
    exit /b 1
)
echo  [OK] Dependensi berhasil diinstall.

:: ================================================================
:: SELESAI
:: ================================================================
echo.
echo  ================================================
echo            INSTALASI SELESAI!
echo.
echo   Sekarang kamu bisa:
echo   -^> Double-click JALANKAN.bat untuk start
echo   -^> Double-click STOP.bat untuk stop
echo  ================================================
echo.
echo  Tekan tombol apa saja untuk menutup...
pause >nul
