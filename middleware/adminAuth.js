/**
 * Protegge le rotte amministrative: richiede una sessione admin valida.
 */
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin === true) {
        return next();
    }
    return res.status(401).json({ error: 'Accesso non autorizzato. Effettua il login.' });
}

module.exports = { requireAdmin };
