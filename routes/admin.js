const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { query, getClient } = require('../config/database');
const { requireAdmin } = require('../middleware/adminAuth');
const { validateRsvpBody, normalizeNameForCompare } = require('../middleware/validation');
const { sendConfirmationEmail } = require('../services/emailService');

const router = express.Router();

const DUPLICATE_MESSAGE = 'Questi dati risultano gia\' associati a un\'altra adesione.';

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppi tentativi di accesso. Riprova piu\' tardi.' }
});

router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        return res.status(400).json({ error: 'Inserisci username e password.' });
    }

    const expectedUsername = process.env.ADMIN_USERNAME || '';
    const expectedHash = process.env.ADMIN_PASSWORD_HASH || '';

    if (!expectedUsername || !expectedHash) {
        console.error('[admin] ADMIN_USERNAME o ADMIN_PASSWORD_HASH non configurate.');
        return res.status(500).json({ error: 'Configurazione amministratore mancante.' });
    }

    try {
        const usernameMatches = username.trim() === expectedUsername;
        const passwordMatches = await bcrypt.compare(password, expectedHash);

        if (!usernameMatches || !passwordMatches) {
            return res.status(401).json({ error: 'Credenziali non valide.' });
        }

        req.session.regenerate((err) => {
            if (err) {
                console.error('[admin] Errore rigenerazione sessione:', err.message);
                return res.status(500).json({ error: 'Errore durante il login.' });
            }

            req.session.isAdmin = true;
            req.session.adminUsername = expectedUsername;

            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('[admin] Errore salvataggio sessione:', saveErr.message);
                    return res.status(500).json({ error: 'Errore durante il login.' });
                }
                return res.status(200).json({ success: true, username: expectedUsername });
            });
        });
    } catch (err) {
        console.error('[admin] Errore durante il login:', err.message);
        return res.status(500).json({ error: 'Errore durante il login.' });
    }
});

router.post('/logout', (req, res) => {
    if (!req.session) {
        return res.status(200).json({ success: true });
    }
    req.session.destroy((err) => {
        if (err) {
            console.error('[admin] Errore durante il logout:', err.message);
            return res.status(500).json({ error: 'Errore durante il logout.' });
        }
        res.clearCookie('festa.sid');
        return res.status(200).json({ success: true });
    });
});

router.get('/me', (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.status(200).json({ authenticated: true, username: req.session.adminUsername });
    }
    return res.status(200).json({ authenticated: false });
});

router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const rsvpStats = await query(`
            SELECT
                COUNT(*)::int AS total_rsvps,
                COALESCE(SUM(CASE WHEN attendance = true THEN 1 ELSE 0 END), 0)::int AS main_present,
                COALESCE(SUM(CASE WHEN attendance = false THEN 1 ELSE 0 END), 0)::int AS absent
            FROM rsvps
        `);

        const guestStats = await query('SELECT COUNT(*)::int AS guest_count FROM guests');

        const { total_rsvps, main_present, absent } = rsvpStats.rows[0];
        const { guest_count } = guestStats.rows[0];

        return res.status(200).json({
            totalRsvps: total_rsvps,
            mainPresent: main_present,
            guestCount: guest_count,
            totalPresent: main_present + guest_count,
            absent
        });
    } catch (err) {
        console.error('[admin] Errore durante il calcolo delle statistiche:', err.message);
        return res.status(500).json({ error: 'Errore durante il caricamento delle statistiche.' });
    }
});

router.get('/rsvps', requireAdmin, async (req, res) => {
    try {
        const result = await query(`
            SELECT
                r.id, r.first_name, r.last_name, r.email, r.phone, r.notes,
                r.attendance, r.has_guest, r.created_at, r.last_email_sent_at,
                g.first_name AS guest_first_name, g.last_name AS guest_last_name,
                g.email AS guest_email, g.phone AS guest_phone, g.notes AS guest_notes
            FROM rsvps r
            LEFT JOIN guests g ON g.rsvp_id = r.id
            ORDER BY r.created_at ASC
        `);

        const rsvps = result.rows.map((row, index) => ({
            number: index + 1,
            id: row.id,
            createdAt: row.created_at,
            lastEmailSentAt: row.last_email_sent_at,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            phone: row.phone,
            notes: row.notes,
            attendance: row.attendance,
            hasGuest: row.has_guest,
            guest: row.has_guest ? {
                firstName: row.guest_first_name,
                lastName: row.guest_last_name,
                email: row.guest_email,
                phone: row.guest_phone,
                notes: row.guest_notes
            } : null
        }));

        return res.status(200).json({ rsvps });
    } catch (err) {
        console.error('[admin] Errore durante il caricamento delle adesioni:', err.message);
        return res.status(500).json({ error: 'Errore durante il caricamento delle adesioni.' });
    }
});

/**
 * Modifica un'adesione esistente (dati principali + eventuale accompagnatore).
 * Riusa la stessa validazione/normalizzazione del form pubblico; il controllo
 * anti-duplicati esclude le identita' gia' appartenenti a QUESTA adesione.
 */
router.put('/rsvps/:id', requireAdmin, validateRsvpBody, async (req, res) => {
    const rsvpId = parseInt(req.params.id, 10);
    if (!Number.isInteger(rsvpId) || rsvpId <= 0) {
        return res.status(400).json({ error: 'ID adesione non valido.' });
    }

    const data = req.validated;

    const mainIdentity = {
        name: normalizeNameForCompare(data.firstName, data.lastName),
        email: data.email,
        phone: data.phone
    };

    let guestIdentity = null;
    if (data.hasGuest && data.guest) {
        guestIdentity = {
            name: normalizeNameForCompare(data.guest.firstName, data.guest.lastName),
            email: data.guest.email,
            phone: data.guest.phone
        };

        if (
            guestIdentity.name === mainIdentity.name ||
            guestIdentity.email === mainIdentity.email ||
            guestIdentity.phone === mainIdentity.phone
        ) {
            return res.status(422).json({
                error: 'I dati dell\'accompagnatore non possono coincidere con quelli dell\'invitato principale.',
                fields: { guestGeneral: 'Inserisci dati diversi per l\'accompagnatore.' }
            });
        }
    }

    const identities = guestIdentity ? [mainIdentity, guestIdentity] : [mainIdentity];
    const names = identities.map((i) => i.name);
    const emails = identities.map((i) => i.email);
    const phones = identities.map((i) => i.phone);

    const client = await getClient();
    try {
        await client.query('BEGIN');

        const existing = await client.query('SELECT id, has_guest FROM rsvps WHERE id = $1 FOR UPDATE', [rsvpId]);
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Adesione non trovata.' });
        }
        const hadGuest = existing.rows[0].has_guest;

        const dupCheck = await client.query(`
            SELECT 1 FROM attendee_identities
            WHERE rsvp_id != $4
              AND (normalized_name = ANY($1::text[]) OR normalized_email = ANY($2::text[]) OR normalized_phone = ANY($3::text[]))
            LIMIT 1
        `, [names, emails, phones, rsvpId]);
        if (dupCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: DUPLICATE_MESSAGE });
        }

        await client.query(`
            UPDATE rsvps
            SET first_name = $1, last_name = $2, email = $3, phone = $4, notes = $5,
                attendance = $6, has_guest = $7, updated_at = now()
            WHERE id = $8
        `, [data.firstName, data.lastName, data.email, data.phone, data.notes, data.attendance, data.hasGuest, rsvpId]);

        await client.query(`
            UPDATE attendee_identities
            SET normalized_name = $1, normalized_email = $2, normalized_phone = $3
            WHERE rsvp_id = $4 AND role = 'main'
        `, [mainIdentity.name, mainIdentity.email, mainIdentity.phone, rsvpId]);

        if (data.hasGuest && data.guest) {
            if (hadGuest) {
                await client.query(`
                    UPDATE guests
                    SET first_name = $1, last_name = $2, email = $3, phone = $4, notes = $5
                    WHERE rsvp_id = $6
                `, [data.guest.firstName, data.guest.lastName, data.guest.email, data.guest.phone, data.guest.notes, rsvpId]);

                await client.query(`
                    UPDATE attendee_identities
                    SET normalized_name = $1, normalized_email = $2, normalized_phone = $3
                    WHERE rsvp_id = $4 AND role = 'guest'
                `, [guestIdentity.name, guestIdentity.email, guestIdentity.phone, rsvpId]);
            } else {
                await client.query(`
                    INSERT INTO guests (rsvp_id, first_name, last_name, email, phone, notes)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [rsvpId, data.guest.firstName, data.guest.lastName, data.guest.email, data.guest.phone, data.guest.notes]);

                await client.query(`
                    INSERT INTO attendee_identities (rsvp_id, role, normalized_name, normalized_email, normalized_phone)
                    VALUES ($1, 'guest', $2, $3, $4)
                `, [rsvpId, guestIdentity.name, guestIdentity.email, guestIdentity.phone]);
            }
        } else if (hadGuest) {
            await client.query('DELETE FROM guests WHERE rsvp_id = $1', [rsvpId]);
            await client.query('DELETE FROM attendee_identities WHERE rsvp_id = $1 AND role = \'guest\'', [rsvpId]);
        }

        await client.query('COMMIT');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('[admin] Errore durante il ROLLBACK (edit):', rollbackErr.message);
        }

        if (err.code === '23505') {
            return res.status(409).json({ error: DUPLICATE_MESSAGE });
        }

        console.error('[admin] Errore durante la modifica dell\'adesione:', err.message);
        return res.status(500).json({ error: 'Si e\' verificato un errore durante il salvataggio. Riprova piu\' tardi.' });
    } finally {
        client.release();
    }

    return res.status(200).json({ success: true });
});

/**
 * Elimina definitivamente un'adesione (e l'eventuale accompagnatore, tramite
 * ON DELETE CASCADE sulle foreign key).
 */
router.delete('/rsvps/:id', requireAdmin, async (req, res) => {
    const rsvpId = parseInt(req.params.id, 10);
    if (!Number.isInteger(rsvpId) || rsvpId <= 0) {
        return res.status(400).json({ error: 'ID adesione non valido.' });
    }

    try {
        const result = await query('DELETE FROM rsvps WHERE id = $1', [rsvpId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Adesione non trovata.' });
        }
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[admin] Errore durante l\'eliminazione dell\'adesione:', err.message);
        return res.status(500).json({ error: 'Errore durante l\'eliminazione. Riprova piu\' tardi.' });
    }
});

/**
 * Reinvia manualmente l'email di conferma per un'adesione gia' salvata.
 * Aggiorna last_email_sent_at solo se l'invio va effettivamente a buon fine.
 */
router.post('/rsvps/:id/resend-email', requireAdmin, async (req, res) => {
    const rsvpId = parseInt(req.params.id, 10);
    if (!Number.isInteger(rsvpId) || rsvpId <= 0) {
        return res.status(400).json({ error: 'ID adesione non valido.' });
    }

    try {
        const result = await query(`
            SELECT
                r.id, r.first_name, r.last_name, r.email, r.phone, r.notes, r.attendance, r.has_guest,
                g.first_name AS guest_first_name, g.last_name AS guest_last_name,
                g.email AS guest_email, g.phone AS guest_phone, g.notes AS guest_notes
            FROM rsvps r
            LEFT JOIN guests g ON g.rsvp_id = r.id
            WHERE r.id = $1
        `, [rsvpId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Adesione non trovata.' });
        }

        const row = result.rows[0];
        const emailResult = await sendConfirmationEmail({
            id: row.id,
            firstName: row.first_name,
            lastName: row.last_name,
            email: row.email,
            phone: row.phone,
            notes: row.notes,
            attendance: row.attendance,
            hasGuest: row.has_guest,
            guest: row.has_guest ? {
                firstName: row.guest_first_name,
                lastName: row.guest_last_name,
                email: row.guest_email,
                phone: row.guest_phone,
                notes: row.guest_notes
            } : null
        });

        if (!emailResult.sent) {
            return res.status(502).json({ error: 'Invio email non riuscito. Riprova piu\' tardi.' });
        }

        const updated = await query(
            'UPDATE rsvps SET last_email_sent_at = now() WHERE id = $1 RETURNING last_email_sent_at',
            [rsvpId]
        );

        return res.status(200).json({ success: true, lastEmailSentAt: updated.rows[0].last_email_sent_at });
    } catch (err) {
        console.error('[admin] Errore durante il reinvio email:', err.message);
        return res.status(500).json({ error: 'Errore durante il reinvio. Riprova piu\' tardi.' });
    }
});

module.exports = router;
