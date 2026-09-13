const express = require('express');
const { getClient } = require('../config/database');
const { validateRsvpBody, normalizeNameForCompare } = require('../middleware/validation');
const { sendConfirmationEmail } = require('../services/emailService');

const router = express.Router();

const DUPLICATE_MESSAGE = 'Risulta gia\' registrata una partecipazione con questi dati. Se devi modificarla, contatta Francesco.';

const DUPLICATE_CHECK_QUERY = `
    SELECT 1 FROM attendee_identities
    WHERE normalized_name = ANY($1::text[])
       OR normalized_email = ANY($2::text[])
       OR normalized_phone = ANY($3::text[])
    LIMIT 1
`;

const INSERT_RSVP_QUERY = `
    INSERT INTO rsvps (first_name, last_name, email, phone, notes, attendance, has_guest)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, created_at
`;

const INSERT_GUEST_QUERY = `
    INSERT INTO guests (rsvp_id, first_name, last_name, email, phone, notes)
    VALUES ($1, $2, $3, $4, $5, $6)
`;

const INSERT_IDENTITY_QUERY = `
    INSERT INTO attendee_identities (rsvp_id, role, normalized_name, normalized_email, normalized_phone)
    VALUES ($1, $2, $3, $4, $5)
`;

router.post('/', validateRsvpBody, async (req, res) => {
    const data = req.validated;

    const mainIdentity = {
        role: 'main',
        name: normalizeNameForCompare(data.firstName, data.lastName),
        email: data.email,
        phone: data.phone
    };

    let guestIdentity = null;
    if (data.hasGuest && data.guest) {
        guestIdentity = {
            role: 'guest',
            name: normalizeNameForCompare(data.guest.firstName, data.guest.lastName),
            email: data.guest.email,
            phone: data.guest.phone
        };

        // L'accompagnatore non puo' coincidere con l'invitato principale
        if (
            guestIdentity.name === mainIdentity.name ||
            guestIdentity.email === mainIdentity.email ||
            guestIdentity.phone === mainIdentity.phone
        ) {
            return res.status(422).json({
                error: 'I dati dell\'accompagnatore non possono coincidere con i tuoi.',
                fields: { guestGeneral: 'Inserisci dati diversi dai tuoi per l\'accompagnatore.' }
            });
        }
    }

    const identities = guestIdentity ? [mainIdentity, guestIdentity] : [mainIdentity];
    const names = identities.map((i) => i.name);
    const emails = identities.map((i) => i.email);
    const phones = identities.map((i) => i.phone);

    const client = await getClient();
    let rsvpId = null;
    let createdAt = null;

    try {
        await client.query('BEGIN');

        const dupCheck = await client.query(DUPLICATE_CHECK_QUERY, [names, emails, phones]);
        if (dupCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: DUPLICATE_MESSAGE });
        }

        const rsvpResult = await client.query(INSERT_RSVP_QUERY, [
            data.firstName,
            data.lastName,
            data.email,
            data.phone,
            data.notes,
            data.attendance,
            data.hasGuest
        ]);
        rsvpId = rsvpResult.rows[0].id;
        createdAt = rsvpResult.rows[0].created_at;

        await client.query(INSERT_IDENTITY_QUERY, [rsvpId, 'main', mainIdentity.name, mainIdentity.email, mainIdentity.phone]);

        if (guestIdentity && data.guest) {
            await client.query(INSERT_GUEST_QUERY, [
                rsvpId,
                data.guest.firstName,
                data.guest.lastName,
                data.guest.email,
                data.guest.phone,
                data.guest.notes
            ]);
            await client.query(INSERT_IDENTITY_QUERY, [rsvpId, 'guest', guestIdentity.name, guestIdentity.email, guestIdentity.phone]);
        }

        await client.query('COMMIT');
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('[rsvp] Errore durante il ROLLBACK:', rollbackErr.message);
        }

        if (err.code === '23505') {
            return res.status(409).json({ error: DUPLICATE_MESSAGE });
        }

        console.error('[rsvp] Errore durante il salvataggio RSVP:', err.message);
        return res.status(500).json({ error: 'Si e\' verificato un errore durante il salvataggio. Riprova piu\' tardi.' });
    } finally {
        client.release();
    }

    // Il salvataggio e' gia' andato a buon fine (COMMIT eseguito). L'invio
    // dell'email NON deve far attendere il client: viene avviato qui ma non
    // "atteso" nella risposta, cosi' un SMTP lento o non raggiungibile non
    // fa restare il form in caricamento. Un eventuale fallimento viene solo
    // loggato: l'RSVP resta comunque valido.
    sendConfirmationEmail({
        id: rsvpId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
        attendance: data.attendance,
        hasGuest: data.hasGuest,
        guest: data.guest
    }).then((emailResult) => {
        if (!emailResult.sent) {
            console.warn(`[rsvp] RSVP #${rsvpId} salvato correttamente ma l'email di conferma non e' partita (${emailResult.reason}).`);
        }
    }).catch((err) => {
        console.error(`[rsvp] Errore inatteso durante l'invio email per rsvp #${rsvpId}:`, err.message);
    });

    return res.status(201).json({
        success: true,
        attendance: data.attendance,
        firstName: data.firstName,
        createdAt
    });
});

module.exports = router;
