require('dotenv').config();

const express = require('express');
const app     = express();
const http    = require('http').createServer(app);
const io      = require('socket.io')(http);
const path    = require('path');
const db      = require('./db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health check — wajib untuk Railway ──────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// ─── In-memory cache ──────────────────────────────────────────────────────────
const vehicleCache  = {};
const driverSockets = {};
const DB_SAVE_INTERVAL_MS = 60_000; // simpan ke DB max 1x per menit per kendaraan

// ─── Root & Short URL ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'landing.html'));
});

// Short URL untuk QR yang dicetak — aman meski domain berubah
app.get('/t/:id', (req, res) => {
    res.redirect(302, `/track.html?id=${encodeURIComponent(req.params.id)}`);
});
app.get('/d/:id', (req, res) => {
    res.redirect(302, `/driver.html?id=${encodeURIComponent(req.params.id)}`);
});

// ─── API: Daftar sopir per kendaraan ─────────────────────────────────────────
app.get('/api/drivers/:vehicleId', async (req, res) => {
    try {
        const list = await db.getDriversByVehicle(req.params.vehicleId, req.query.q || '');
        res.json(list.map(d => ({ name: d.name })));
    } catch (err) {
        console.error('[API /drivers]', err.message);
        res.status(500).json({ error: 'Gagal mengambil data sopir.' });
    }
});

// ─── API: Login sopir ─────────────────────────────────────────────────────────
app.post('/api/driver/login', async (req, res) => {
    try {
        const { vehicleId, name, pin } = req.body;
        if (!vehicleId || !name || !pin)
            return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });

        const driver = await db.verifyDriver(vehicleId, name, pin);
        if (driver) {
            res.json({ success: true, name: driver.name, vehicleId: driver.vehicle_code });
        } else {
            res.json({ success: false, message: 'Nama atau PIN salah.' });
        }
    } catch (err) {
        console.error('[API /driver/login]', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ─── API: Semua kendaraan aktif ───────────────────────────────────────────────
app.get('/api/vehicles', async (req, res) => {
    try {
        const fromDB = await db.getAllVehicles();
        const result = fromDB.map(v => ({
            ...v,
            isOnline:   vehicleCache[v.id]?.isOnline   ?? v.isOnline,
            driverName: vehicleCache[v.id]?.driverName ?? v.driverName,
            lat:        vehicleCache[v.id]?.lat        ?? v.lat,
            lng:        vehicleCache[v.id]?.lng        ?? v.lng,
            updatedAt:  vehicleCache[v.id]?.updatedAt  ?? v.updatedAt,
        }));
        res.json(result);
    } catch (err) {
        console.error('[API /vehicles]', err.message);
        res.status(500).json({ error: 'Gagal mengambil data kendaraan.' });
    }
});

// ─── ADMIN API: Kendaraan ─────────────────────────────────────────────────────
app.get('/api/admin/kendaraan', async (req, res) => {
    try {
        const { rows } = await db.pool.query(
            `SELECT id, vehicle_code, plate_number, route, is_active, created_at
             FROM vehicles ORDER BY vehicle_code`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data kendaraan.' });
    }
});

app.post('/api/admin/kendaraan', async (req, res) => {
    try {
        const { vehicle_code, plate_number, route, is_active = true } = req.body;
        if (!vehicle_code) return res.status(400).json({ error: 'Kode kendaraan wajib diisi.' });
        const { rows } = await db.pool.query(
            `INSERT INTO vehicles (vehicle_code, plate_number, route, is_active)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [vehicle_code.trim().toUpperCase(), plate_number, route, is_active]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Kode kendaraan sudah ada.' });
        res.status(500).json({ error: 'Gagal menambahkan kendaraan.' });
    }
});

app.put('/api/admin/kendaraan/:id', async (req, res) => {
    try {
        const { vehicle_code, plate_number, route, is_active } = req.body;
        const { rows } = await db.pool.query(
            `UPDATE vehicles SET vehicle_code=$1, plate_number=$2, route=$3, is_active=$4
             WHERE id=$5 RETURNING *`,
            [vehicle_code.trim().toUpperCase(), plate_number, route, is_active, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Kode sudah dipakai.' });
        res.status(500).json({ error: 'Gagal memperbarui kendaraan.' });
    }
});

app.delete('/api/admin/kendaraan/:id', async (req, res) => {
    try {
        await db.pool.query(`UPDATE vehicles SET is_active=false WHERE id=$1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus kendaraan.' });
    }
});

// ─── ADMIN API: Sopir ─────────────────────────────────────────────────────────
app.get('/api/admin/sopir', async (req, res) => {
    try {
        const { rows } = await db.pool.query(
            `SELECT d.id, d.name, d.phone, d.pin, d.vehicle_id, d.is_active,
                    v.vehicle_code
             FROM drivers d
             LEFT JOIN vehicles v ON v.id = d.vehicle_id
             ORDER BY d.name`
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data sopir.' });
    }
});

app.post('/api/admin/sopir', async (req, res) => {
    try {
        const { name, phone, pin, vehicle_id, is_active = true } = req.body;
        if (!name || !pin) return res.status(400).json({ error: 'Nama dan PIN wajib diisi.' });
        const { rows } = await db.pool.query(
            `INSERT INTO drivers (name, phone, pin, vehicle_id, is_active)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name.trim(), phone, pin, vehicle_id || null, is_active]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Gagal menambahkan sopir.' });
    }
});

app.put('/api/admin/sopir/:id', async (req, res) => {
    try {
        const { name, phone, pin, vehicle_id, is_active } = req.body;
        const { rows } = await db.pool.query(
            `UPDATE drivers SET name=$1, phone=$2, pin=$3, vehicle_id=$4, is_active=$5
             WHERE id=$6 RETURNING *`,
            [name.trim(), phone, pin, vehicle_id || null, is_active, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Sopir tidak ditemukan.' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui sopir.' });
    }
});

app.delete('/api/admin/sopir/:id', async (req, res) => {
    try {
        await db.pool.query(`UPDATE drivers SET is_active=false WHERE id=$1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus sopir.' });
    }
});

// ─── ADMIN API: Sesi ──────────────────────────────────────────────────────────
app.get('/api/admin/sesi', async (req, res) => {
    try {
        const todayOnly = req.query.today === '1';
        const sql = todayOnly
            ? `SELECT s.id, v.vehicle_code, d.name AS driver_name,
                      s.started_at, s.ended_at, s.status
               FROM sessions s
               JOIN vehicles v ON v.id = s.vehicle_id
               JOIN drivers  d ON d.id = s.driver_id
               WHERE s.started_at >= CURRENT_DATE
               ORDER BY s.started_at DESC`
            : `SELECT s.id, v.vehicle_code, d.name AS driver_name,
                      s.started_at, s.ended_at, s.status
               FROM sessions s
               JOIN vehicles v ON v.id = s.vehicle_id
               JOIN drivers  d ON d.id = s.driver_id
               ORDER BY s.started_at DESC LIMIT 50`;
        const { rows } = await db.pool.query(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Gagal mengambil data sesi.' });
    }
});

// ─── Helper: throttle simpan ke DB ───────────────────────────────────────────
async function throttledLogLocation(vehicleCode, sessionId, vehicleNumId, lat, lng) {
    const entry = vehicleCache[vehicleCode];
    if (!entry || !sessionId || !vehicleNumId) return;

    const now = Date.now();
    if (now - (entry._lastSaved ?? 0) < DB_SAVE_INTERVAL_MS) return;

    entry._lastSaved = now;
    db.logLocation(sessionId, vehicleNumId, lat, lng)
        .catch(err => console.error('[logLocation]', err.message));
}

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] ${socket.id}`);

    // Sopir join setelah login
    socket.on('driverJoin', async ({ vehicleId, driverName }) => {
        try {
            socket.join(vehicleId);
            socket.data = { vehicleId, driverName, role: 'driver' };
            driverSockets[socket.id] = vehicleId;

            const vehicleNumId = await db.getVehicleId(vehicleId);
            const { rows: dr } = await db.pool.query(
                `SELECT d.id FROM drivers d
                 JOIN vehicles v ON v.id = d.vehicle_id
                 WHERE v.vehicle_code=$1 AND d.name=$2 AND d.is_active=true`,
                [vehicleId, driverName]
            );
            const driverId = dr[0]?.id;

            let sessionId = null;
            if (vehicleNumId && driverId) {
                sessionId = await db.createSession(vehicleNumId, driverId);
                console.log(`[Sesi] #${sessionId} — ${driverName} → ${vehicleId}`);
            }

            if (!vehicleCache[vehicleId]) vehicleCache[vehicleId] = {};
            Object.assign(vehicleCache[vehicleId], {
                vehicleId:   vehicleNumId,
                vehicleCode: vehicleId,
                driverName,
                sessionId,
                isOnline:    true,
                _lastSaved:  0,
            });
            socket.data.sessionId    = sessionId;
            socket.data.vehicleNumId = vehicleNumId;

            io.to(vehicleId).emit('driverStatus', { online: true, vehicleId, driverName });
            io.to('__monitor__').emit('vehicleUpdate', { ...vehicleCache[vehicleId], isOnline: true });
            io.to('__nearby__').emit('vehicleUpdate',  { ...vehicleCache[vehicleId], isOnline: true });
        } catch (err) {
            console.error('[driverJoin]', err.message);
        }
    });

    // Penumpang join room kendaraan
    socket.on('joinRoom', (vehicleId) => {
        socket.join(vehicleId);
        socket.data = { vehicleId, role: 'passenger' };
        const cached = vehicleCache[vehicleId];
        if (cached?.lat) socket.emit('locationUpdate', cached);
        socket.emit('driverStatus', {
            online:     cached?.isOnline   ?? false,
            vehicleId,
            driverName: cached?.driverName ?? '—',
        });
    });

    // Monitor
    socket.on('joinMonitor', async () => {
        socket.join('__monitor__');
        socket.data = { role: 'monitor' };
        try {
            const fromDB = await db.getAllVehicles();
            const snapshot = fromDB.map(v => ({
                ...v,
                isOnline:   vehicleCache[v.id]?.isOnline   ?? v.isOnline,
                driverName: vehicleCache[v.id]?.driverName ?? v.driverName,
                lat:        vehicleCache[v.id]?.lat        ?? v.lat,
                lng:        vehicleCache[v.id]?.lng        ?? v.lng,
            }));
            socket.emit('allLocations', snapshot);
        } catch (err) {
            socket.emit('allLocations', Object.values(vehicleCache));
        }
    });

    // Nearby
    socket.on('joinNearby', async () => {
        socket.join('__nearby__');
        socket.data = { role: 'nearby' };
        try {
            const fromDB = await db.getAllVehicles();
            const snapshot = fromDB.map(v => ({
                ...v,
                isOnline:   vehicleCache[v.id]?.isOnline   ?? v.isOnline,
                driverName: vehicleCache[v.id]?.driverName ?? v.driverName,
                lat:        vehicleCache[v.id]?.lat        ?? v.lat,
                lng:        vehicleCache[v.id]?.lng        ?? v.lng,
            }));
            socket.emit('allLocations', snapshot);
        } catch (err) {
            socket.emit('allLocations', Object.values(vehicleCache));
        }
    });

    // Update lokasi dari sopir
    socket.on('updateLocation', async ({ vehicleId, lat, lng }) => {
        if (!vehicleId || lat === undefined || lng === undefined) return;

        const entry = vehicleCache[vehicleId] || {};
        const payload = {
            ...entry,
            vehicleCode: vehicleId,
            lat, lng,
            updatedAt: Date.now(),
            isOnline:  true,
            driverName: entry.driverName || socket.data?.driverName || '—',
        };
        vehicleCache[vehicleId] = payload;

        io.to(vehicleId).emit('locationUpdate', payload);
        io.to('__monitor__').emit('vehicleUpdate', payload);
        io.to('__nearby__').emit('vehicleUpdate',  payload);

        throttledLogLocation(vehicleId, entry.sessionId, entry.vehicleId, lat, lng);
    });

    // Disconnect
    socket.on('disconnect', async () => {
        const { vehicleId, role, driverName, sessionId } = socket.data || {};
        console.log(`[-] ${socket.id} (${role}, ${vehicleId || '—'})`);

        if (role === 'driver' && vehicleId && driverSockets[socket.id] === vehicleId) {
            delete driverSockets[socket.id];
            if (vehicleCache[vehicleId]) vehicleCache[vehicleId].isOnline = false;

            io.to(vehicleId).emit('driverStatus', { online: false, vehicleId });
            io.to('__monitor__').emit('vehicleUpdate', {
                ...(vehicleCache[vehicleId] || {}), vehicleCode: vehicleId, isOnline: false
            });
            io.to('__nearby__').emit('vehicleUpdate', {
                ...(vehicleCache[vehicleId] || {}), vehicleCode: vehicleId, isOnline: false
            });

            if (sessionId) {
                db.endSession(sessionId)
                    .then(() => console.log(`[Sesi] #${sessionId} ditutup — ${driverName}`))
                    .catch(err => console.error('[endSession]', err.message));
            }
        }
    });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

async function start() {
    await db.testConnection();
    http.listen(PORT, () => {
        console.log(`✅ Server jalan di http://localhost:${PORT}`);
    });
}

start();