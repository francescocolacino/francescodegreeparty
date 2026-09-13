require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');

const { pool, testConnection } = require('./config/database');
const { verifyMailer } = require('./config/mailer');

const rsvpRoutes = require('./routes/rsvp');
const adminRoutes = require('./routes/admin');
const mailRoutes = require('./routes/mail');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Railway (e altri PaaS) espongono l'app dietro un reverse proxy: serve per
// far funzionare correttamente cookie "secure" e il rilevamento IP per il rate limit.
app.set('trust proxy', 1);

const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"]
};
if (isProduction) {
    cspDirectives.upgradeInsecureRequests = [];
}

app.use(helmet({
    contentSecurityPolicy: { directives: cspDirectives }
}));

app.use(express.json({ limit: '20kb' }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
    console.error('[server] ATTENZIONE: SESSION_SECRET non impostata. Impostala nelle variabili d\'ambiente prima del deploy.');
}

app.use(session({
    store: new pgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    name: 'festa.sid',
    secret: sessionSecret || 'dev-insecure-secret-change-me',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000 // 8 ore
    }
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
});

const rsvpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppi tentativi. Riprova tra qualche minuto.' }
});

app.use('/api', apiLimiter);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/event-info', (req, res) => {
    res.status(200).json({
        name: process.env.EVENT_NAME || '',
        date: process.env.EVENT_DATE || '',
        time: process.env.EVENT_TIME || '',
        locationName: process.env.EVENT_LOCATION_NAME || '',
        address: process.env.EVENT_ADDRESS || '',
        note: process.env.EVENT_NOTE || '',
        mapsUrl: process.env.EVENT_MAPS_URL || ''
    });
});

app.use('/api/rsvp', rsvpLimiter, rsvpRoutes);
app.use('/api/admin/email', mailRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Risorsa non trovata.' });
});

app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestione centralizzata degli errori: nessun dettaglio interno esposto al client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Richiesta non valida.' });
    }
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Richiesta troppo grande.' });
    }
    console.error('[server] Errore non gestito:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Si e\' verificato un errore interno. Riprova piu\' tardi.' });
});

async function start() {
    try {
        await testConnection();
        console.log('[server] Connessione al database riuscita.');
    } catch (err) {
        console.error('[server] Impossibile connettersi al database:', err.message);
    }

    // Un problema SMTP non deve impedire l'avvio del server se il DB funziona.
    verifyMailer().catch(() => {});

    app.listen(PORT, () => {
        console.log(`[server] In ascolto sulla porta ${PORT} (${isProduction ? 'production' : 'development'})`);
    });
}

start();

module.exports = app;
