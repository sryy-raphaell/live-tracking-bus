# 🚀 Panduan Deploy — Railway + Neon PostgreSQL

Panduan ini menjelaskan cara deploy sistem tracking bus ke internet
menggunakan Railway (backend) dan Neon (database PostgreSQL gratis).

---

## Persiapan Akun (Satu Kali)

### 1. Buat Akun GitHub

Kalau belum punya: https://github.com/signup

### 2. Buat Akun Railway

- Buka https://railway.app
- Klik **Login with GitHub**
- Izinkan akses GitHub

### 3. Buat Akun Neon (PostgreSQL gratis)

- Buka https://neon.tech
- Klik **Sign Up** → pilih **Continue with GitHub**

---

## Langkah A — Setup Database di Neon

### A1. Buat Project Neon

1. Login ke https://console.neon.tech
2. Klik **New Project**
3. Isi nama: `tracking-bus`
4. Region: pilih yang paling dekat (Singapore)
5. Klik **Create Project**

### A2. Salin Connection String

Setelah project dibuat, kamu akan lihat halaman connection string:

```
postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/tracking_db?sslmode=require
```

**Simpan string ini** — akan dipakai di langkah Railway nanti.

### A3. Jalankan Schema

Di halaman Neon, klik tab **SQL Editor**, lalu paste isi file `db/schema.sql`
dan klik **Run**.

### A4. Jalankan Seed Data (Opsional)

Masih di SQL Editor, paste isi file `db/seed.sql` dan klik **Run**.
Ini menambahkan 4 kendaraan dan 6 sopir contoh.

---

## Langkah B — Upload Project ke GitHub

### B1. Inisialisasi Git (di terminal Linux)

```bash
cd live-tracking-bus

# Pastikan .gitignore ada dan node_modules tidak ikut
git init
git add .
git commit -m "Initial commit — live tracking bus"
```

### B2. Buat Repository di GitHub

1. Buka https://github.com/new
2. Nama repo: `live-tracking-bus`
3. Pilih **Private** (agar kode tidak publik)
4. Klik **Create repository**

### B3. Push ke GitHub

```bash
git remote add origin https://github.com/USERNAME/live-tracking-bus.git
git branch -M main
git push -u origin main
```

---

## Langkah C — Deploy di Railway

### C1. Buat Project Baru

1. Login ke https://railway.app/dashboard
2. Klik **New Project**
3. Pilih **Deploy from GitHub repo**
4. Authorize Railway untuk akses GitHub
5. Pilih repo `live-tracking-bus`
6. Klik **Deploy Now**

Railway akan otomatis detect Node.js dan mulai build.

### C2. Tambahkan Environment Variable

1. Di dashboard Railway, klik project kamu
2. Klik tab **Variables**
3. Klik **Add Variable** untuk setiap baris berikut:

| Key            | Value                                     |
| -------------- | ----------------------------------------- |
| `DATABASE_URL` | (connection string dari Neon, langkah A2) |
| `NODE_ENV`     | `production`                              |

4. Railway akan otomatis restart server setelah variable ditambahkan.

### C3. Dapatkan Domain

1. Klik tab **Settings**
2. Di bagian **Networking**, klik **Generate Domain**
3. Kamu akan dapat URL seperti: `https://live-tracking-bus-production.up.railway.app`

**Ini URL sistem tracking kamu yang bisa diakses dari mana saja!**

---

## Langkah D — Verifikasi Deploy

Buka browser dan akses:

| URL                                               | Fungsi                                      |
| ------------------------------------------------- | ------------------------------------------- |
| `https://domain-kamu.up.railway.app/`             | Halaman utama                               |
| `https://domain-kamu.up.railway.app/health`       | Cek server (harus muncul `{"status":"ok"}`) |
| `https://domain-kamu.up.railway.app/monitor.html` | Monitor armada                              |
| `https://domain-kamu.up.railway.app/nearby.html`  | Bus terdekat                                |

---

## Langkah E — Generate QR untuk Produksi

Setelah dapat domain Railway, generate ulang QR di halaman admin
menggunakan domain baru tersebut. QR lama (localhost) tidak akan berfungsi.

1. Buka `https://domain-kamu.up.railway.app/`
2. Masukkan kode kendaraan (BD-01, BD-02, dst.)
3. Klik Generate QR
4. Cetak QR Sopir dan QR Penumpang

---

## Monitoring & Maintenance

### Cek Log Server

Di Railway dashboard → klik project → tab **Logs**

### Update Kode

```bash
git add .
git commit -m "Update fitur X"
git push
```

Railway akan otomatis redeploy setiap push ke GitHub.

### Cek Database

Buka https://console.neon.tech → SQL Editor untuk query langsung.

---

## Biaya

| Layanan | Free Tier        | Limit                             |
| ------- | ---------------- | --------------------------------- |
| Railway | $5 credit/bulan  | ~500 jam aktif                    |
| Neon    | Gratis selamanya | 0.5 GB storage, 190 compute hours |

Untuk prototype dan demo, free tier sudah lebih dari cukup.
Kalau butuh lebih, Railway mulai $5/bulan.

---

## Troubleshooting

**Server gagal start:**

- Cek tab Logs di Railway
- Pastikan `DATABASE_URL` sudah diset dengan benar

**Database connection error:**

- Pastikan connection string Neon sudah include `?sslmode=require`
- Cek apakah schema sudah dijalankan

**GPS tidak jalan di HP:**

- Pastikan akses via HTTPS (bukan HTTP)
- Railway otomatis kasih HTTPS, jadi ini tidak masalah

**WebSocket disconnect terus:**

- Normal untuk free tier — Railway mungkin sleep setelah tidak ada traffic
- Upgrade ke paid plan kalau butuh uptime 24/7
