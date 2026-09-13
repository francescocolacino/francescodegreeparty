-- =====================================================================
-- Schema database per la gestione inviti/RSVP festa di laurea
-- Tutte le istruzioni sono idempotenti (sicure da rieseguire ad ogni
-- deploy/redeploy senza cancellare dati esistenti).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabella principale: una riga per ogni modulo RSVP compilato
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rsvps (
    id            SERIAL PRIMARY KEY,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(30)  NOT NULL,
    notes         TEXT         NOT NULL,
    attendance    BOOLEAN      NOT NULL,
    has_guest     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Accompagnatore: al massimo uno per RSVP (vincolo UNIQUE su rsvp_id)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guests (
    id            SERIAL PRIMARY KEY,
    rsvp_id       INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
    first_name    VARCHAR(100) NOT NULL,
    last_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL,
    phone         VARCHAR(30)  NOT NULL,
    notes         TEXT         NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT guests_rsvp_id_unique UNIQUE (rsvp_id)
);

-- ---------------------------------------------------------------------
-- Registro identita' normalizzate: una riga per ogni persona registrata
-- (sia invitato principale che accompagnatore). Gli indici UNIQUE su
-- nome normalizzato / email normalizzata / telefono normalizzato sono
-- la difesa "hard" contro le doppie iscrizioni anche in caso di
-- richieste concorrenti (vedi routes/rsvp.js).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendee_identities (
    id                  SERIAL PRIMARY KEY,
    rsvp_id             INTEGER NOT NULL REFERENCES rsvps(id) ON DELETE CASCADE,
    role                VARCHAR(10) NOT NULL CHECK (role IN ('main', 'guest')),
    normalized_name     VARCHAR(210) NOT NULL,
    normalized_email    VARCHAR(255) NOT NULL,
    normalized_phone    VARCHAR(30)  NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendee_identities_name_unique  UNIQUE (normalized_name),
    CONSTRAINT attendee_identities_email_unique UNIQUE (normalized_email),
    CONSTRAINT attendee_identities_phone_unique UNIQUE (normalized_phone)
);

-- ---------------------------------------------------------------------
-- Storico comunicazioni email inviate dall'admin
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_campaigns (
    id                 SERIAL PRIMARY KEY,
    subject            VARCHAR(255) NOT NULL,
    message            TEXT         NOT NULL,
    recipient_filter   VARCHAR(20)  NOT NULL,
    recipient_count    INTEGER      NOT NULL DEFAULT 0,
    success_count      INTEGER      NOT NULL DEFAULT 0,
    failure_count      INTEGER      NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Tabella sessioni admin (usata da connect-pg-simple).
-- Struttura compatibile con quella richiesta dalla libreria.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session (
    sid    VARCHAR NOT NULL PRIMARY KEY,
    sess   JSON    NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

-- ---------------------------------------------------------------------
-- Indici
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rsvps_created_at        ON rsvps (created_at);
CREATE INDEX IF NOT EXISTS idx_rsvps_attendance         ON rsvps (attendance);
CREATE INDEX IF NOT EXISTS idx_guests_rsvp_id           ON guests (rsvp_id);
CREATE INDEX IF NOT EXISTS idx_attendee_identities_rsvp ON attendee_identities (rsvp_id);
CREATE INDEX IF NOT EXISTS idx_session_expire           ON session (expire);
