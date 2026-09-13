const express = require('express');
const { query } = require('../config/database');
const { requireAdmin } = require('../middleware/adminAuth');
const { sendCampaignEmailToRecipient } = require('../services/emailService');

const router = express.Router();

const VALID_FILTERS = new Set(['attendees', 'all', 'absent']);
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;
const SEND_DELAY_MS = 150;

router.use(requireAdmin);

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Recupera dal DB (mai dal client) la lista dei destinatari per il filtro
 * scelto, deduplicando per email.
 */
async function getRecipients(filter) {
    const recipientsMap = new Map();

    const addRows = (rows) => {
        for (const row of rows) {
            const email = row.email;
            if (email && !recipientsMap.has(email)) {
                recipientsMap.set(email, { email, firstName: row.first_name });
            }
        }
    };

    if (filter === 'attendees') {
        const mainRes = await query('SELECT first_name, email FROM rsvps WHERE attendance = true');
        addRows(mainRes.rows);
        const guestRes = await query(`
            SELECT g.first_name, g.email
            FROM guests g
            JOIN rsvps r ON r.id = g.rsvp_id
            WHERE r.attendance = true
        `);
        addRows(guestRes.rows);
    } else if (filter === 'absent') {
        const mainRes = await query('SELECT first_name, email FROM rsvps WHERE attendance = false');
        addRows(mainRes.rows);
    } else {
        // 'all'
        const mainRes = await query('SELECT first_name, email FROM rsvps');
        addRows(mainRes.rows);
        const guestRes = await query('SELECT first_name, email FROM guests');
        addRows(guestRes.rows);
    }

    return Array.from(recipientsMap.values());
}

router.get('/recipients-count', async (req, res) => {
    const filter = VALID_FILTERS.has(req.query.filter) ? req.query.filter : 'attendees';
    try {
        const recipients = await getRecipients(filter);
        return res.status(200).json({ filter, count: recipients.length });
    } catch (err) {
        console.error('[mail] Errore conteggio destinatari:', err.message);
        return res.status(500).json({ error: 'Errore durante il conteggio dei destinatari.' });
    }
});

router.post('/send', async (req, res) => {
    const { recipientFilter, subject, message } = req.body || {};

    const filter = VALID_FILTERS.has(recipientFilter) ? recipientFilter : 'attendees';

    if (typeof subject !== 'string' || !subject.trim()) {
        return res.status(422).json({ error: 'L\'oggetto e\' obbligatorio.' });
    }
    if (subject.trim().length > SUBJECT_MAX) {
        return res.status(422).json({ error: `L'oggetto e' troppo lungo (massimo ${SUBJECT_MAX} caratteri).` });
    }
    if (typeof message !== 'string' || !message.trim()) {
        return res.status(422).json({ error: 'Il messaggio e\' obbligatorio.' });
    }
    if (message.trim().length > MESSAGE_MAX) {
        return res.status(422).json({ error: `Il messaggio e' troppo lungo (massimo ${MESSAGE_MAX} caratteri).` });
    }

    // eslint-disable-next-line no-control-regex
    const cleanSubject = subject.trim().replace(/[\r\n]+/g, ' ');
    const cleanMessage = message.trim();

    let recipients;
    try {
        recipients = await getRecipients(filter);
    } catch (err) {
        console.error('[mail] Errore recupero destinatari:', err.message);
        return res.status(500).json({ error: 'Errore durante il recupero dei destinatari.' });
    }

    let successCount = 0;
    let failureCount = 0;

    // Invio individuale e sequenziale: mai tutti gli indirizzi in un unico
    // messaggio (to/cc/bcc), per non esporre le email degli altri invitati.
    for (const recipient of recipients) {
        try {
            await sendCampaignEmailToRecipient({
                to: recipient.email,
                firstName: recipient.firstName,
                subject: cleanSubject,
                message: cleanMessage
            });
            successCount += 1;
        } catch (err) {
            failureCount += 1;
            console.error(`[mail] Invio fallito a ${recipient.email}:`, err.message);
        }
        if (SEND_DELAY_MS > 0) {
            // eslint-disable-next-line no-await-in-loop
            await delay(SEND_DELAY_MS);
        }
    }

    try {
        await query(`
            INSERT INTO email_campaigns (subject, message, recipient_filter, recipient_count, success_count, failure_count)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [cleanSubject, cleanMessage, filter, recipients.length, successCount, failureCount]);
    } catch (err) {
        console.error('[mail] Errore salvataggio storico campagna:', err.message);
    }

    return res.status(200).json({
        total: recipients.length,
        sent: successCount,
        failed: failureCount
    });
});

router.get('/history', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, subject, recipient_filter, recipient_count, success_count, failure_count, created_at
            FROM email_campaigns
            ORDER BY created_at DESC
            LIMIT 20
        `);
        return res.status(200).json({ campaigns: result.rows });
    } catch (err) {
        console.error('[mail] Errore caricamento storico campagne:', err.message);
        return res.status(500).json({ error: 'Errore durante il caricamento dello storico.' });
    }
});

module.exports = router;
