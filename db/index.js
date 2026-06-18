// db/index.js — PostgreSQL connection pool
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('[DB] Idle client error:', err.message);
});

// ── Verifikasi koneksi saat startup ────────────────────────
async function testConnection() {
    try {
        const res = await pool.query('SELECT NOW() AS now');
        console.log(`[DB] PostgreSQL terhubung ✓  (${res.rows[0].now})`);
    } catch (err) {
        console.error('[DB] Gagal terhubung ke PostgreSQL:', err.message);
        console.error('     Pastikan DATABASE_URL di environment variable sudah benar.');
        process.exit(1);
    }
}

// ── Query helpers ───────────────────────────────────────────

async function getDriversByVehicle(vehicleCode, query = '') {
    const sql = `
        SELECT d.id, d.name, d.phone
        FROM drivers d
        JOIN vehicles v ON v.id = d.vehicle_id
        WHERE v.vehicle_code = $1
          AND d.is_active = true
          AND ($2 = '' OR LOWER(d.name) LIKE LOWER('%' || $2 || '%'))
        ORDER BY d.name
    `;
    const { rows } = await pool.query(sql, [vehicleCode, query]);
    return rows;
}

async function verifyDriver(vehicleCode, name, pin) {
    const sql = `
        SELECT d.id, d.name, d.phone, v.vehicle_code, v.route, v.plate_number
        FROM drivers d
        JOIN vehicles v ON v.id = d.vehicle_id
        WHERE v.vehicle_code = $1
          AND d.name          = $2
          AND d.pin           = $3
          AND d.is_active     = true
          AND v.is_active     = true
    `;
    const { rows } = await pool.query(sql, [vehicleCode, name, pin]);
    return rows[0] || null;
}

async function createSession(vehicleId, driverId) {
    await pool.query(
        `UPDATE sessions SET status = 'ended', ended_at = NOW()
         WHERE vehicle_id = $1 AND status = 'active'`,
        [vehicleId]
    );
    const { rows } = await pool.query(
        `INSERT INTO sessions (vehicle_id, driver_id) VALUES ($1, $2) RETURNING id`,
        [vehicleId, driverId]
    );
    return rows[0].id;
}

async function endSession(sessionId) {
    if (!sessionId) return;
    await pool.query(
        `UPDATE sessions SET status = 'ended', ended_at = NOW() WHERE id = $1`,
        [sessionId]
    );
}

async function logLocation(sessionId, vehicleId, lat, lng) {
    await pool.query(
        `INSERT INTO location_logs (session_id, vehicle_id, lat, lng)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, vehicleId, lat, lng]
    );
}

async function getAllVehicles() {
    const sql = `
        SELECT
            v.vehicle_code          AS id,
            v.plate_number,
            v.route,
            ll.lat,
            ll.lng,
            ll.logged_at            AS "updatedAt",
            ll.driver_name          AS "driverName",
            (ase.vehicle_id IS NOT NULL) AS "isOnline",
            EXTRACT(EPOCH FROM (NOW() - ll.logged_at))::INT AS "secsAgo"
        FROM vehicles v
        LEFT JOIN latest_locations ll  ON ll.vehicle_id = v.id
        LEFT JOIN active_sessions  ase ON ase.vehicle_id = v.id
        WHERE v.is_active = true
        ORDER BY v.vehicle_code
    `;
    const { rows } = await pool.query(sql);
    return rows;
}

async function getVehicleId(vehicleCode) {
    const { rows } = await pool.query(
        'SELECT id FROM vehicles WHERE vehicle_code = $1',
        [vehicleCode]
    );
    return rows[0]?.id || null;
}

module.exports = {
    pool,
    testConnection,
    getDriversByVehicle,
    verifyDriver,
    createSession,
    endSession,
    logLocation,
    getAllVehicles,
    getVehicleId
};