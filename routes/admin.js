const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { query } = require('../config/database');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

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
                r.attendance, r.has_guest, r.created_at,
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

module.exports = router;
