@echo off
title Damri Tracking - Stop Server
color 0C

echo.
echo  ================================================
echo     DAMRI PESISIR SELATAN - LIVE TRACKING
echo              Menghentikan Server
echo  ================================================
echo.

echo  [INFO] Menghentikan proses Node.js...
taskkill /F /IM node.exe >nul 2>&1

if %errorLevel% equ 0 (
    echo  [OK] Server berhasil dihentikan.
) else (
    echo  [INFO] Tidak ada server yang sedang berjalan.
)

echo.
echo  Tekan tombol apa saja untuk menutup...
pause >nul
