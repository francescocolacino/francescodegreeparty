/**
 * Inizializza (in modo idempotente) lo schema del database.
 * Uso: npm run db:init
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('Errore: variabile DATABASE_URL non impostata.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    const sqlPath = path.join(__dirname, '..', 'db', 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Connessione al database...');
    const client = await pool.connect();
    try {
        console.log('Esecuzione db/init.sql...');
        await client.query(sql);
        console.log('Schema database creato/aggiornato con successo.');
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Errore durante inizializzazione database:', err.message);
    process.exit(1);
});
