const { transporter, getFromHeader, isMailerEnabled } = require('../config/mailer');

const COLORS = {
    bordeaux: '#5c1a2b',
    bordeauxDark: '#3e0f1c',
    cream: '#faf6ee',
    gold: '#c9a24b',
    text: '#2b2320'
};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function nl2br(str) {
    return escapeHtml(str).replace(/\r\n|\r|\n/g, '<br>');
}

function getEventInfo() {
    return {
        name: process.env.EVENT_NAME || 'Festa di Laurea',
        date: process.env.EVENT_DATE || '',
        time: process.env.EVENT_TIME || '',
        locationName: process.env.EVENT_LOCATION_NAME || '',
        address: process.env.EVENT_ADDRESS || '',
        note: process.env.EVENT_NOTE || ''
    };
}

/**
 * Involucro HTML condiviso da tutte le email, coerente con lo stile
 * elegante (bordeaux / crema / oro) del sito pubblico.
 */
function renderEmailShell({ preheader = '', title, bodyHtml }) {
    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.cream};font-family:Georgia,'Times New Roman',serif;color:${COLORS.text};">
<span style="display:none;font-size:1px;color:${COLORS.cream};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.cream};padding:24px 12px;">
<tr>
<td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e8ded0;">
<tr>
<td style="background-color:${COLORS.bordeaux};background-image:linear-gradient(135deg, ${COLORS.bordeaux}, ${COLORS.bordeauxDark});padding:32px 28px;text-align:center;">
<div style="font-size:30px;line-height:1;margin-bottom:6px;">&#127891;</div>
<div style="font-family:Georgia,'Times New Roman',serif;color:${COLORS.gold};font-size:13px;letter-spacing:2px;text-transform:uppercase;">Festa di Laurea</div>
</td>
</tr>
<tr>
<td style="padding:32px 28px;">
${bodyHtml}
</td>
</tr>
<tr>
<td style="padding:20px 28px;background-color:#f6f0e6;text-align:center;font-size:12px;color:#8a7a68;">
Questa email e\' stata inviata automaticamente in relazione alla tua adesione alla festa di laurea.
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}

function detailRow(label, value) {
    return `<tr>
<td style="padding:6px 10px;font-size:13px;color:#8a7a68;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
<td style="padding:6px 10px;font-size:15px;color:${COLORS.text};width:100%;">${escapeHtml(value)}</td>
</tr>`;
}

function personDetailsTable(person) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ded0;border-radius:8px;margin:12px 0 20px;">
${detailRow('Nome', person.firstName)}
${detailRow('Cognome', person.lastName)}
${detailRow('Email', person.email)}
${detailRow('Telefono', person.phone)}
${detailRow('Note / allergie', person.notes)}
</table>`;
}

function sectionTitle(text) {
    return `<div style="font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${COLORS.bordeaux};border-bottom:2px solid ${COLORS.gold};display:inline-block;padding-bottom:4px;margin:22px 0 4px;">${escapeHtml(text)}</div>`;
}

/**
 * Costruisce oggetto + HTML dell'email di conferma RSVP.
 */
function buildConfirmationEmail(rsvp) {
    const event = getEventInfo();
    const eventName = event.name;
    const subject = `Conferma – ${eventName} 🎓`;

    let bodyHtml = `<p style="font-size:16px;margin:0 0 16px;">Ciao ${escapeHtml(rsvp.firstName)},</p>`;

    if (rsvp.attendance) {
        bodyHtml += `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
La tua partecipazione a <strong>${escapeHtml(eventName)}</strong> e\' stata registrata correttamente. Che gioia averti con noi!
</p>`;

        bodyHtml += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f0e6;border-radius:8px;margin-bottom:8px;">
<tr><td style="padding:16px 18px;font-size:14px;line-height:2;">
&#128197; <strong>Data:</strong> ${escapeHtml(event.date)}<br>
&#128343; <strong>Ora:</strong> ${escapeHtml(event.time)}<br>
&#128205; <strong>Location:</strong> ${escapeHtml(event.locationName)}<br>
&#128205; <strong>Indirizzo:</strong> ${escapeHtml(event.address)}
</td></tr>
</table>`;

        if (event.note) {
            bodyHtml += `<p style="font-size:13.5px;font-style:italic;color:${COLORS.bordeaux};margin:0 0 16px;">${escapeHtml(event.note)}</p>`;
        }

        bodyHtml += sectionTitle('Dati registrati');
        bodyHtml += personDetailsTable(rsvp);

        bodyHtml += `<p style="font-size:14px;margin:0 0 4px;"><strong>Accompagnatore:</strong> ${rsvp.hasGuest ? 'Sì' : 'No'}</p>`;

        if (rsvp.hasGuest && rsvp.guest) {
            bodyHtml += sectionTitle('Dati accompagnatore');
            bodyHtml += personDetailsTable(rsvp.guest);
        }

        bodyHtml += `<p style="font-size:16px;margin:24px 0 0;">Ci vediamo alla festa! &#127881;<br><strong>Francesco</strong></p>`;
    } else {
        bodyHtml += `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
Grazie per avermi fatto sapere che non potrai essere presente a <strong>${escapeHtml(eventName)}</strong>. La tua risposta e\' stata registrata correttamente.
</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Mi dispiace che non potrai esserci &#10084;&#65039;</p>
<p style="font-size:16px;margin:24px 0 0;">Un abbraccio,<br><strong>Francesco</strong></p>`;
    }

    const html = renderEmailShell({
        title: subject,
        preheader: rsvp.attendance ? 'La tua partecipazione e\' confermata.' : 'La tua risposta e\' stata registrata.',
        bodyHtml
    });

    return { subject, html };
}

/**
 * Costruisce oggetto + HTML per una comunicazione inviata dall'admin
 * a un singolo destinatario (testo libero convertito in HTML).
 */
function buildCampaignEmail({ firstName, subject, message }) {
    const bodyHtml = `<p style="font-size:16px;margin:0 0 16px;">Ciao ${escapeHtml(firstName)},</p>
<p style="font-size:15px;line-height:1.7;margin:0 0 16px;white-space:normal;">${nl2br(message)}</p>
<p style="font-size:16px;margin:24px 0 0;">A presto!<br><strong>Francesco</strong></p>`;

    const html = renderEmailShell({
        title: subject,
        preheader: message.slice(0, 100),
        bodyHtml
    });

    return { subject, html };
}

/**
 * Invia l'email di conferma dopo il salvataggio di un RSVP.
 * Non deve MAI lanciare un errore che invalidi la richiesta: eventuali
 * problemi vengono solo loggati (l'RSVP e\' gia\' stato salvato).
 */
async function sendConfirmationEmail(rsvp) {
    if (!isMailerEnabled()) {
        console.warn('[emailService] Invio email di conferma saltato: mailer non configurato.');
        return { sent: false, reason: 'mailer_disabled' };
    }

    try {
        const { subject, html } = buildConfirmationEmail(rsvp);
        await transporter.sendMail({
            from: getFromHeader(),
            to: rsvp.email,
            subject,
            html
        });
        return { sent: true };
    } catch (err) {
        console.error(`[emailService] Invio email di conferma fallito per rsvp #${rsvp.id || '?'}:`, err.message);
        return { sent: false, reason: err.message };
    }
}

/**
 * Invia una singola email di comunicazione a un destinatario.
 * Usata dal servizio di invio massivo (un invio alla volta, mai in cc/bcc).
 */
async function sendCampaignEmailToRecipient({ to, firstName, subject, message }) {
    if (!isMailerEnabled()) {
        throw new Error('mailer_disabled');
    }
    const { subject: finalSubject, html } = buildCampaignEmail({ firstName, subject, message });
    await transporter.sendMail({
        from: getFromHeader(),
        to,
        subject: finalSubject,
        html
    });
}

module.exports = {
    getEventInfo,
    sendConfirmationEmail,
    sendCampaignEmailToRecipient,
    escapeHtml
};
