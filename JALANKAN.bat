@echo off
title Damri Tracking - Server Aktif
color 0A

echo.
echo  ================================================
echo     DAMRI PESISIR SELATAN - LIVE TRACKING
echo              Menjalankan Server
echo  ================================================
echo.

set "WORK_DIR=%~dp0"
cd /d "%WORK_DIR%"

:: -- Tambah PostgreSQL ke PATH --
for %%p in (
    "C:\Program Files\PostgreSQL\16\bin"
    "C:\Program Files\PostgreSQL\15\bin"
    "C:\Program Files\PostgreSQL\14\bin"
    "C:\Program Files\PostgreSQL\17\bin"
) do (
    if exist "%%~p\psql.exe" (
        set "PATH=%PATH%;%%~p"
        goto :pg_path_set
    )
)
:pg_path_set

:: -- Cek apakah .env ada --
if not exist "%WORK_DIR%.env" (
    echo  [X] File .env tidak ditemukan!
    echo  [X] Jalankan INSTALL.bat terlebih dahulu.
    echo.
    pause
    exit /b 1
)

:: -- Cek apakah node_modules ada --
if not exist "%WORK_DIR%node_modules" (
    echo  [X] Dependensi belum diinstall!
    echo  [X] Jalankan INSTALL.bat terlebih dahulu.
    echo.
    pause
    exit /b 1
)

:: -- Pastikan service PostgreSQL berjalan --
echo  [INFO] Memeriksa PostgreSQL...
sc query postgresql-damri | find "RUNNING" >nul 2>&1
if %errorLevel% neq 0 (
    sc query postgresql-x64-16 | find "RUNNING" >nul 2>&1
    if %errorLevel% neq 0 (
        echo  [INFO] Menghidupkan PostgreSQL...
        net start postgresql-damri >nul 2>&1
        net start postgresql-x64-16 >nul 2>&1
        net start postgresql-x64-15 >nul 2>&1
        net start postgresql-x64-14 >nul 2>&1
        timeout /t 2 >nul
    )
)
echo  [OK] PostgreSQL aktif.

:: -- Tampilkan IP lokal --
echo.
echo  [OK] Mencari alamat IP...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "LOCAL_IP=%%a"
    goto :ip_found
)
:ip_found
set "LOCAL_IP=%LOCAL_IP: =%"

echo.
echo  ================================================
echo   Server berjalan di:
echo.
echo   Lokal    -^> http://localhost:3000
echo   Jaringan -^> http://%LOCAL_IP%:3000
echo.
echo   Akses dari HP yang sama WiFi:
echo   http://%LOCAL_IP%:3000
echo  ================================================
echo.
echo  [!] Jangan tutup jendela ini selama bus beroperasi!
echo  [!] Tekan Ctrl+C untuk menghentikan server.
echo.

:: -- Jalankan server --
node server.js

echo.
echo  [!] Server berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
