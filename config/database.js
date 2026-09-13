const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('[database] Variabile DATABASE_URL non impostata. Il server non potra\' funzionare correttamente.');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
    console.error('[database] Errore inatteso sul pool PostgreSQL:', err.message);
});

/**
 * Esegue una query semplice usando il pool condiviso.
 */
function query(text, params) {
    return pool.query(text, params);
}

/**
 * Ottiene un client dedicato dal pool, utile per le transazioni
 * (BEGIN / COMMIT / ROLLBACK). Ricordarsi di chiamare client.release().
 */
function getClient() {
    return pool.connect();
}

async function testConnection() {
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        return true;
    } finally {
        client.release();
    }
}

module.exports = { pool, query, getClient, testConnection };
