const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve file statis (HTML, CSS, JS) dari folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Routing dasar
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Logic Socket.io
io.on('connection', (socket) => {
    console.log('User terhubung:', socket.id);

    // 1. Join Room (Berdasarkan ID Kendaraan, misal: "Angkot-01")
    socket.on('joinRoom', (vehicleId) => {
        socket.join(vehicleId);
        console.log(`Socket ${socket.id} masuk ke room ${vehicleId}`);
    });

    // 2. Terima Lokasi dari Sopir -> Broadcast ke Penumpang
    socket.on('updateLocation', (data) => {
        // data = { vehicleId: 'Angkot-01', lat: -6.x, lng: 106.x }
        // Kirim hanya ke orang yang ada di room yang sama
        io.to(data.vehicleId).emit('locationUpdate', {
            lat: data.lat,
            lng: data.lng
        });
    });

    socket.on('disconnect', () => {
        console.log('User terputus');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server jalan di port ${PORT}`);
});