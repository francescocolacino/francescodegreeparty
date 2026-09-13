const nodemailer = require('nodemailer');

const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GOOGLE_APP_PASSWORD;

let transporter = null;

if (gmailUser && gmailPass) {
    transporter = nodemailer.createTransport({
        // Porta 587 con STARTTLS invece della scorciatoia "service: gmail"
        // (che userebbe la 465 con TLS implicito): alcune piattaforme cloud
        // filtrano la 465 in uscita, mentre la 587 e' quasi sempre permessa.
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: gmailUser,
            pass: gmailPass
        },
        // Timeout brevi: se la rete blocca/droppa i pacchetti in silenzio,
        // l'invio deve fallire in pochi secondi invece di restare appeso.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });
} else {
    console.warn('[mailer] GMAIL_USER o GOOGLE_APP_PASSWORD non impostate: l\'invio email e\' disabilitato.');
}

/**
 * Verifica la configurazione SMTP senza bloccare l'avvio del server
 * in caso di problemi (il DB rimane comunque utilizzabile).
 */
async function verifyMailer() {
    if (!transporter) {
        console.warn('[mailer] Transporter non configurato, verifica saltata.');
        return false;
    }
    try {
        await transporter.verify();
        console.log('[mailer] Connessione SMTP Gmail verificata con successo.');
        return true;
    } catch (err) {
        console.error('[mailer] Verifica SMTP fallita:', err.message);
        return false;
    }
}

function getFromHeader() {
    const fromName = process.env.MAIL_FROM_NAME || 'Festa di Laurea';
    return `"${fromName}" <${gmailUser}>`;
}

function isMailerEnabled() {
    return Boolean(transporter);
}

module.exports = { transporter, verifyMailer, getFromHeader, isMailerEnabled };
