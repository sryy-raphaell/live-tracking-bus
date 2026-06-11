const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.json());

// ─── State in-memory ──────────────────────────────────────────────────────────
const vehicleLocations = {};  // { vehicleId: { lat, lng, updatedAt, driverName } }
const vehicleDrivers   = {};  // { vehicleId: socketId }

// ─── Data sopir & kendaraan (nanti bisa diganti DB) ───────────────────────────
// Format: { pin, name, vehicleId }
const driversDB = [
    { pin: '1234', name: 'Pak Budi',   vehicleId: 'Angkot-01' },
    { pin: '2345', name: 'Pak Andi',   vehicleId: 'Angkot-01' },
    { pin: '3456', name: 'Bu Sari',    vehicleId: 'Angkot-02' },
    { pin: '4567', name: 'Pak Doni',   vehicleId: 'Angkot-02' },
    { pin: '5678', name: 'Pak Rudi',   vehicleId: 'Angkot-03' },
];

// ─── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// ─── API: Ambil daftar sopir berdasarkan vehicleId ────────────────────────────
app.get('/api/drivers/:vehicleId', (req, res) => {
    const { vehicleId } = req.params;
    const { q } = req.query;
    let list = driversDB.filter(d => d.vehicleId === vehicleId);
    if (q) {
        const query = q.toLowerCase();
        list = list.filter(d => d.name.toLowerCase().includes(query));
    }
    res.json(list.map(d => ({ name: d.name }))); // jangan kirim PIN ke frontend
});

// ─── API: Verifikasi login sopir ──────────────────────────────────────────────
app.post('/api/driver/login', (req, res) => {
    const { vehicleId, name, pin } = req.body;
    const driver = driversDB.find(
        d => d.vehicleId === vehicleId && d.name === name && d.pin === pin
    );
    if (driver) {
        res.json({ success: true, name: driver.name, vehicleId });
    } else {
        res.json({ success: false, message: 'Nama atau PIN salah.' });
    }
});

// ─── API: Semua kendaraan (untuk admin & nearby) ──────────────────────────────
app.get('/api/vehicles', (req, res) => {
    const list = Object.entries(vehicleLocations).map(([id, data]) => ({
        id,
        ...data,
        isOnline: vehicleDrivers[id] !== undefined,
        secsAgo: data.updatedAt ? Math.floor((Date.now() - data.updatedAt) / 1000) : null
    }));
    res.json(list);
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[+] Terhubung: ${socket.id}`);

    // Sopir join setelah login berhasil
    socket.on('driverJoin', ({ vehicleId, driverName }) => {
        socket.join(vehicleId);
        socket.data.vehicleId  = vehicleId;
        socket.data.driverName = driverName;
        socket.data.role       = 'driver';
        vehicleDrivers[vehicleId] = socket.id;

        // Simpan nama sopir aktif ke lokasi
        if (!vehicleLocations[vehicleId]) {
            vehicleLocations[vehicleId] = {
                vehicleId,
                lat: null,
                lng: null,
                updatedAt: null
            };
        }
        vehicleLocations[vehicleId].driverName = driverName;

        console.log(`[Sopir] ${driverName} → room "${vehicleId}"`);
        io.to(vehicleId).emit('driverStatus', { online: true, vehicleId, driverName });
        io.to('__monitor__').emit('vehicleUpdate', {
            ...vehicleLocations[vehicleId],
            isOnline: true
        });
    });

    // Penumpang join room kendaraan tertentu
    socket.on('joinRoom', (vehicleId) => {
        socket.join(vehicleId);
        socket.data.vehicleId = vehicleId;
        socket.data.role      = 'passenger';

        if (vehicleLocations[vehicleId]) {
            socket.emit('locationUpdate', vehicleLocations[vehicleId]);
        }
        const isOnline = vehicleDrivers[vehicleId] !== undefined;
        socket.emit('driverStatus', {
            online: isOnline,
            vehicleId,
            driverName: vehicleLocations[vehicleId]?.driverName || '—'
        });
    });

    // Monitor join — pantau semua kendaraan
    socket.on('joinMonitor', () => {
        socket.join('__monitor__');
        socket.data.role = 'monitor';
        const snapshot = Object.entries(vehicleLocations).map(([id, data]) => ({
            ...data,
            isOnline: vehicleDrivers[id] !== undefined
        }));
        socket.emit('allLocations', snapshot);
    });

    // Nearby join — penumpang di halte lihat semua angkot
    socket.on('joinNearby', () => {
        socket.join('__nearby__');
        socket.data.role = 'nearby';
        const snapshot = Object.entries(vehicleLocations).map(([id, data]) => ({
            ...data,
            isOnline: vehicleDrivers[id] !== undefined
        }));
        socket.emit('allLocations', snapshot);
    });

    // Sopir kirim koordinat
    socket.on('updateLocation', (data) => {
        const { vehicleId, lat, lng } = data;
        if (!vehicleId || lat === undefined || lng === undefined) return;

        const payload = {
            vehicleId, lat, lng,
            updatedAt:  Date.now(),
            isOnline:   true,
            driverName: vehicleLocations[vehicleId]?.driverName || socket.data.driverName || '—'
        };
        vehicleLocations[vehicleId] = payload;

        io.to(vehicleId).emit('locationUpdate', payload);
        io.to('__monitor__').emit('vehicleUpdate', payload);
        io.to('__nearby__').emit('vehicleUpdate', payload);
    });

    // Disconnect
    socket.on('disconnect', () => {
        const { vehicleId, role, driverName } = socket.data || {};
        console.log(`[-] Terputus: ${socket.id} (${role}, ${vehicleId})`);

        if (role === 'driver' && vehicleId) {
            if (vehicleDrivers[vehicleId] === socket.id) {
                delete vehicleDrivers[vehicleId];
                io.to(vehicleId).emit('driverStatus', { online: false, vehicleId });
                io.to('__monitor__').emit('vehicleUpdate', {
                    ...(vehicleLocations[vehicleId] || {}),
                    vehicleId, isOnline: false
                });
                io.to('__nearby__').emit('vehicleUpdate', {
                    ...(vehicleLocations[vehicleId] || {}),
                    vehicleId, isOnline: false
                });
                console.log(`[!] Sopir "${driverName}" (${vehicleId}) offline`);
            }
        }
    });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`✅ Server jalan di http://localhost:${PORT}`);
});