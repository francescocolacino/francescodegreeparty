/**
 * Genera l'hash bcrypt di una password da usare come ADMIN_PASSWORD_HASH.
 * Uso: npm run hash-password -- "LaMiaPasswordSegreta"
 */
const bcrypt = require('bcrypt');

const password = process.argv[2];

if (!password) {
    console.error('Uso: npm run hash-password -- "LaTuaPassword"');
    process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
    console.log('\nAggiungi questa riga al tuo file .env (o alle variabili Railway):\n');
    console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
}).catch((err) => {
    console.error('Errore generazione hash:', err.message);
    process.exit(1);
});
