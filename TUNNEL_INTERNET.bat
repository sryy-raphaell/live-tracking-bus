@echo off
title Damri Tracking - Tunnel Internet
color 0B

echo.
echo  ================================================
echo     DAMRI PESISIR SELATAN - LIVE TRACKING
echo          Membuka Akses dari Internet
echo  ================================================
echo.
echo  Script ini membuat URL publik gratis via Cloudflare
echo  agar sopir/penumpang bisa akses dari mana saja.
echo.

set "WORK_DIR=%~dp0"
cd /d "%WORK_DIR%"

:: -- Cek apakah cloudflared sudah ada --
if exist "%WORK_DIR%cloudflared.exe" goto :run_tunnel

:: -- Download cloudflared --
echo  [INFO] Mengunduh Cloudflare Tunnel (cloudflared)...
powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%WORK_DIR%cloudflared.exe' -UseBasicParsing }"

if not exist "%WORK_DIR%cloudflared.exe" (
    echo  [X] Gagal mengunduh cloudflared. Periksa koneksi internet.
    pause
    exit /b 1
)
echo  [OK] cloudflared berhasil diunduh.

:run_tunnel
echo.
echo  [INFO] Memastikan server lokal berjalan di port 3000...
curl -s http://localhost:3000 >nul 2>&1
if %errorLevel% neq 0 (
    echo  [X] Server belum berjalan!
    echo  [X] Buka JALANKAN.bat di jendela lain terlebih dahulu.
    echo.
    pause
    exit /b 1
)

echo  [OK] Server lokal aktif.
echo.
echo  ================================================
echo   Membuka tunnel ke internet...
echo.
echo   URL publik akan muncul di bawah ini dalam
echo   beberapa detik - contoh:
echo   https://xxxx-xxx-xxx.trycloudflare.com
echo.
echo   Salin URL tersebut dan bagikan ke sopir/penumpang!
echo  ================================================
echo.
echo  [!] Jangan tutup jendela ini selama dibutuhkan!
echo  [!] URL akan berbeda setiap kali tunnel dibuka.
echo  [!] Tekan Ctrl+C untuk menutup tunnel.
echo.

"%WORK_DIR%cloudflared.exe" tunnel --url http://localhost:3000

echo.
echo  Tunnel ditutup. Tekan tombol apa saja untuk keluar.
pause >nul
