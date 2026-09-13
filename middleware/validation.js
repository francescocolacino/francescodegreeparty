/**
 * Normalizzazione e validazione server-side dei dati RSVP.
 * Non ci si fida mai dei dati provenienti dal frontend: tutto quello
 * che arriva qui viene ri-validato da zero.
 */

const NAME_MAX = 100;
const EMAIL_MAX = 255;
const PHONE_MAX = 30;
const NOTES_MAX = 1000;

const NAME_REGEX = /^[\p{L}\p{M}\s'.-]{1,100}$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_REGEX = /^\+?[0-9]{6,15}$/;

// Caratteri di controllo da rimuovere dagli input, mantenendo newline (\n) e tab (\t)
const CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function collapseSpaces(str) {
    return String(str).trim().replace(/\s+/g, ' ');
}

function stripControlChars(str) {
    return String(str).replace(CONTROL_CHARS_REGEX, '');
}

function normalizeEmail(email) {
    return collapseSpaces(email).toLowerCase();
}

function normalizePhone(phone) {
    const trimmed = String(phone).trim();
    const hasPlus = trimmed.startsWith('+');
    const digitsOnly = trimmed.replace(/[^0-9]/g, '');
    return (hasPlus ? '+' : '') + digitsOnly;
}

function normalizeNameForCompare(firstName, lastName) {
    return collapseSpaces(`${firstName} ${lastName}`).toLowerCase();
}

/**
 * Valida e normalizza i dati di una singola persona (invitato principale
 * o accompagnatore). Ritorna { data, errors } dove errors e' una mappa
 * campo -> messaggio (vuota se tutto valido).
 */
function validatePerson(raw, fieldPrefix) {
    const errors = {};
    const out = {};

    if (!raw || typeof raw !== 'object') {
        raw = {};
    }

    // Nome
    const firstNameRaw = typeof raw.firstName === 'string' ? collapseSpaces(stripControlChars(raw.firstName)) : '';
    if (!firstNameRaw) {
        errors[`${fieldPrefix}firstName`] = 'Il nome e\' obbligatorio.';
    } else if (firstNameRaw.length > NAME_MAX) {
        errors[`${fieldPrefix}firstName`] = 'Il nome e\' troppo lungo.';
    } else if (!NAME_REGEX.test(firstNameRaw)) {
        errors[`${fieldPrefix}firstName`] = 'Il nome contiene caratteri non validi.';
    } else {
        out.firstName = firstNameRaw;
    }

    // Cognome
    const lastNameRaw = typeof raw.lastName === 'string' ? collapseSpaces(stripControlChars(raw.lastName)) : '';
    if (!lastNameRaw) {
        errors[`${fieldPrefix}lastName`] = 'Il cognome e\' obbligatorio.';
    } else if (lastNameRaw.length > NAME_MAX) {
        errors[`${fieldPrefix}lastName`] = 'Il cognome e\' troppo lungo.';
    } else if (!NAME_REGEX.test(lastNameRaw)) {
        errors[`${fieldPrefix}lastName`] = 'Il cognome contiene caratteri non validi.';
    } else {
        out.lastName = lastNameRaw;
    }

    // Email
    const emailRaw = typeof raw.email === 'string' ? normalizeEmail(stripControlChars(raw.email)) : '';
    if (!emailRaw) {
        errors[`${fieldPrefix}email`] = 'L\'email e\' obbligatoria.';
    } else if (emailRaw.length > EMAIL_MAX) {
        errors[`${fieldPrefix}email`] = 'L\'email e\' troppo lunga.';
    } else if (!EMAIL_REGEX.test(emailRaw)) {
        errors[`${fieldPrefix}email`] = 'Inserisci un indirizzo email valido.';
    } else {
        out.email = emailRaw;
    }

    // Telefono
    const phoneInputRaw = typeof raw.phone === 'string' ? stripControlChars(raw.phone).trim() : '';
    const phoneNormalized = phoneInputRaw ? normalizePhone(phoneInputRaw) : '';
    if (!phoneInputRaw) {
        errors[`${fieldPrefix}phone`] = 'Il numero di telefono e\' obbligatorio.';
    } else if (phoneInputRaw.length > PHONE_MAX || !PHONE_REGEX.test(phoneNormalized)) {
        errors[`${fieldPrefix}phone`] = 'Inserisci un numero di telefono valido.';
    } else {
        out.phone = phoneNormalized;
    }

    // Note / allergie
    const notesRaw = typeof raw.notes === 'string' ? stripControlChars(raw.notes).trim() : '';
    if (!notesRaw) {
        errors[`${fieldPrefix}notes`] = 'Questo campo e\' obbligatorio (scrivi "Nessuna" se non ci sono comunicazioni).';
    } else if (notesRaw.length > NOTES_MAX) {
        errors[`${fieldPrefix}notes`] = `Il testo e\' troppo lungo (massimo ${NOTES_MAX} caratteri).`;
    } else {
        out.notes = notesRaw;
    }

    return { data: out, errors };
}

/**
 * Middleware Express: valida l'intero payload di POST /api/rsvp.
 * In caso di errore risponde direttamente con 422 e la mappa di errori
 * per campo; altrimenti popola req.validated con i dati normalizzati.
 */
function validateRsvpBody(req, res, next) {
    const body = req.body || {};
    const errors = {};

    if (typeof body.attendance !== 'boolean') {
        errors.attendance = 'Indica se sarai presente o meno.';
    }

    const mainResult = validatePerson(body, '');
    Object.assign(errors, mainResult.errors);

    let hasGuest = false;
    let guestData = null;

    if (body.attendance === true) {
        hasGuest = body.hasGuest === true;

        if (hasGuest) {
            const guestResult = validatePerson(body.guest, 'guest');
            Object.assign(errors, guestResult.errors);
            guestData = guestResult.data;
        }
    }

    if (Object.keys(errors).length > 0) {
        return res.status(422).json({
            error: 'Alcuni campi non sono validi. Controlla e riprova.',
            fields: errors
        });
    }

    req.validated = {
        firstName: mainResult.data.firstName,
        lastName: mainResult.data.lastName,
        email: mainResult.data.email,
        phone: mainResult.data.phone,
        notes: mainResult.data.notes,
        attendance: body.attendance,
        hasGuest,
        guest: hasGuest ? guestData : null
    };

    next();
}

module.exports = {
    validateRsvpBody,
    validatePerson,
    normalizeEmail,
    normalizePhone,
    normalizeNameForCompare,
    collapseSpaces,
    stripControlChars,
    NOTES_MAX
};
