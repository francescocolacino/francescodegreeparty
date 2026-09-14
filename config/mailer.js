/**
 * Invio email tramite Gmail API (HTTPS) invece di SMTP.
 *
 * Railway (piano Hobby) blocca le porte SMTP in uscita (465/587/2525) per
 * tutti gli utenti, quindi Nodemailer via SMTP non e' utilizzabile in
 * produzione. La Gmail API usa richieste HTTPS su porta 443 (mai bloccata),
 * e invia realmente tramite l'infrastruttura di Google: l'email arriva
 * autenticata (SPF/DKIM/DMARC), a differenza di un invio "spoofed" da un
 * indirizzo @gmail.com tramite un provider SMTP terzo.
 *
 * Richiede un progetto Google Cloud con Gmail API abilitata e un OAuth
 * client con scope "gmail.send" (vedi README per la procedura completa).
 */

const GMAIL_USER = process.env.GMAIL_USER;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

const isConfigured = Boolean(GMAIL_USER && CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);

if (!isConfigured) {
    console.warn('[mailer] GMAIL_USER, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REFRESH_TOKEN non impostate: l\'invio email e\' disabilitato.');
}

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

/**
 * Scambia il refresh token per un access token valido, con una piccola
 * cache in memoria (gli access token Google durano circa un'ora).
 */
async function getAccessToken() {
    const now = Date.now();
    if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60000) {
        return cachedAccessToken;
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token'
        })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Rinnovo token Google fallito (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    cachedAccessToken = data.access_token;
    cachedAccessTokenExpiresAt = now + (Number(data.expires_in || 3600) * 1000);
    return cachedAccessToken;
}

function base64UrlEncode(str) {
    return Buffer.from(str, 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Costruisce il messaggio MIME grezzo richiesto dalla Gmail API
 * (RFC 2822), con oggetto codificato per i caratteri non ASCII (es. emoji).
 */
function buildRawMessage({ from, to, subject, html }) {
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    const message = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${encodedSubject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        '',
        html
    ].join('\r\n');

    return base64UrlEncode(message);
}

/**
 * Invia un'email tramite la Gmail API. Lancia un errore se il mailer non e'
 * configurato o se l'invio fallisce: il chiamante decide come gestirlo.
 */
async function sendMail({ from, to, subject, html }) {
    if (!isConfigured) {
        throw new Error('mailer_disabled');
    }

    const accessToken = await getAccessToken();
    const raw = buildRawMessage({ from, to, subject, html });

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw })
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Invio Gmail API fallito (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    return res.json();
}

/**
 * Verifica la configurazione (ottenendo un access token) senza bloccare
 * l'avvio del server in caso di problemi.
 */
async function verifyMailer() {
    if (!isConfigured) {
        console.warn('[mailer] Credenziali Gmail API non configurate, verifica saltata.');
        return false;
    }
    try {
        await getAccessToken();
        console.log('[mailer] Credenziali Gmail API verificate con successo.');
        return true;
    } catch (err) {
        console.error('[mailer] Verifica Gmail API fallita:', err.message);
        return false;
    }
}

function getFromHeader() {
    const fromName = process.env.MAIL_FROM_NAME || 'Festa di Laurea';
    return `"${fromName}" <${GMAIL_USER}>`;
}

function isMailerEnabled() {
    return isConfigured;
}

module.exports = { sendMail, verifyMailer, getFromHeader, isMailerEnabled };
