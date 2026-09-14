# Festa di Laurea — Inviti & RSVP

Sito per la gestione degli inviti e delle adesioni alla festa di laurea, con
pagina pubblica per l'RSVP, invio email automatico e pannello amministratore
per statistiche, elenco invitati e comunicazioni via email.

Stack: Node.js, Express, PostgreSQL (`pg`), HTML/CSS/JS vanilla, Gmail API
per l'invio email, `express-session` + `connect-pg-simple`, `bcrypt`,
`helmet`, `express-rate-limit`. Nessun framework frontend.

---

## 1. Avvio locale

Requisiti: Node.js >= 18 e un database PostgreSQL raggiungibile.

```bash
npm install
cp .env.example .env
# modifica .env con i tuoi valori (vedi sezioni sotto)
npm run db:init
npm start
```

Il sito e' disponibile su `http://localhost:3000` (pagina pubblica) e
`http://localhost:3000/admin` (pannello admin).

Per lo sviluppo con riavvio automatico: `npm run dev` (richiede `nodemon`,
gia' incluso tra le devDependencies).

---

## 2. Configurazione PostgreSQL

L'app si connette al database tramite un'unica variabile d'ambiente:

```
DATABASE_URL=postgresql://utente:password@host:porta/nome_database
```

In locale puoi usare un'istanza PostgreSQL installata sul tuo sistema o un
container Docker, ad esempio:

```bash
docker run --name festa-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

e quindi impostare:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

Dopo aver impostato `DATABASE_URL`, crea le tabelle con:

```bash
npm run db:init
```

Lo script esegue `db/init.sql`, che usa solo istruzioni idempotenti
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`): puoi
rieseguirlo in qualsiasi momento (es. dopo ogni deploy) senza perdere i
dati gia' presenti.

Su Railway, se aggiungi un plugin PostgreSQL al progetto, imposta:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

---

## 3. Configurazione Gmail (invio email)

L'app invia le email tramite la **Gmail API** (HTTPS) e non via SMTP: molte
piattaforme cloud (Railway incluso, sul piano gratuito) bloccano le porte
SMTP in uscita, mentre le chiamate HTTPS funzionano sempre. In piu', inviare
davvero tramite l'infrastruttura Google (anziche' con un provider SMTP
terzo che finge di essere @gmail.com) evita i blocchi anti-spoofing
(SPF/DKIM/DMARC) applicati dai principali provider di posta.

Serve un progetto Google Cloud con OAuth2 configurato (gratuito, richiede
solo un account Google):

1. Vai su [console.cloud.google.com](https://console.cloud.google.com/) e
   crea un nuovo progetto (nome a piacere, es. "Festa Laurea").
2. **Abilita la Gmail API**: menu "API e servizi" → "Libreria" → cerca
   "Gmail API" → **Abilita**.
3. **Configura la schermata di consenso OAuth**: "API e servizi" → "Schermata
   di consenso OAuth" → tipo utente **Esterno** → compila i campi
   obbligatori (nome app, email di supporto, email sviluppatore) → nella
   sezione "Utenti di test" aggiungi il tuo indirizzo Gmail (quello che
   invia le email). Non serve la verifica Google per uso personale.
4. **Crea le credenziali OAuth**: "API e servizi" → "Credenziali" → "Crea
   credenziali" → "ID client OAuth" → tipo applicazione **Applicazione web**
   → in "URI di reindirizzamento autorizzati" aggiungi:
   `https://developers.google.com/oauthplayground` → Crea. Salva **Client
   ID** e **Client secret**.
5. **Genera il refresh token** con [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):
   - Icona ingranaggio (in alto a destra) → spunta "Use your own OAuth
     credentials" → incolla Client ID e Client secret.
   - Nel pannello a sinistra cerca "Gmail API v1", seleziona lo scope
     `https://www.googleapis.com/auth/gmail.send` → **Authorize APIs**.
   - Accedi con l'account Gmail che invia le email e concedi il permesso
     (se compare un avviso "app non verificata", e' normale per un progetto
     personale: procedi con "Avanzate" → "Vai a [nome app] (non sicuro)").
   - Torna nel Playground e clicca **Exchange authorization code for
     tokens**: copia il **Refresh token** mostrato.
6. Imposta le variabili:

```
GMAIL_USER=tuoindirizzo@gmail.com
GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxxxx
GOOGLE_REFRESH_TOKEN=xxxxxxxxxx
MAIL_FROM_NAME=Festa di Laurea - Francesco
```

Se queste variabili non sono impostate, il server parte comunque (l'invio
email viene semplicemente disabilitato e loggato come warning): un problema
di invio non deve mai impedire il salvataggio delle adesioni.

---

## 4. Creazione della password admin

La password dell'amministratore NON viene mai salvata in chiaro: si salva
solo il suo hash bcrypt in `ADMIN_PASSWORD_HASH`.

Genera l'hash con:

```bash
npm run hash-password -- "LaTuaPasswordSegreta"
```

Copia il valore stampato (`ADMIN_PASSWORD_HASH=...`) nel tuo `.env` (o nelle
variabili d'ambiente Railway), insieme a:

```
ADMIN_USERNAME=francesco
SESSION_SECRET=una-stringa-lunga-e-casuale
```

Per generare una `SESSION_SECRET` sicura:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. Variabili d'ambiente

Vedi `.env.example` per l'elenco completo. Riepilogo:

| Variabile | Descrizione |
|---|---|
| `NODE_ENV` | `development` o `production` |
| `PORT` | Porta HTTP (su Railway impostata automaticamente) |
| `DATABASE_URL` | Stringa di connessione PostgreSQL |
| `SESSION_SECRET` | Segreto per firmare i cookie di sessione admin |
| `ADMIN_USERNAME` | Username dell'amministratore |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt della password admin |
| `GMAIL_USER` | Indirizzo Gmail mittente |
| `GOOGLE_CLIENT_ID` | Client ID OAuth2 (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | Client secret OAuth2 |
| `GOOGLE_REFRESH_TOKEN` | Refresh token OAuth2 (scope `gmail.send`) |
| `MAIL_FROM_NAME` | Nome mittente mostrato nelle email |
| `EVENT_NAME` | Nome evento mostrato su sito ed email |
| `EVENT_DATE` | Data evento (testo libero, es. "26 settembre 2026") |
| `EVENT_TIME` | Ora evento (es. "18:30") |
| `EVENT_LOCATION_NAME` | Nome della location |
| `EVENT_ADDRESS` | Indirizzo completo (facoltativo, usato anche per il link Maps se `EVENT_MAPS_URL` non e' impostato) |
| `EVENT_NOTE` | Nota breve facoltativa mostrata sotto i dettagli evento |
| `EVENT_MAPS_URL` | Link diretto a Google Maps per il pulsante "Apri su Maps" |

`.env` e' incluso in `.gitignore` e non deve mai essere committato.

---

## 6. Deploy su Railway

1. Crea un repository Git e fai push del progetto su GitHub.
2. Su [railway.app](https://railway.app) crea un nuovo progetto → **Deploy
   from GitHub repo** → seleziona il repository.
3. Aggiungi un servizio **PostgreSQL** al progetto (New → Database →
   PostgreSQL).
4. Nel servizio dell'app, vai su **Variables** e aggiungi:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (riferimento al servizio Postgres)
   - `SESSION_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`
   - `GMAIL_USER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `MAIL_FROM_NAME`
   - `EVENT_NAME`, `EVENT_DATE`, `EVENT_TIME`, `EVENT_LOCATION_NAME`, `EVENT_ADDRESS`
   - `NODE_ENV=production`
5. Esegui il deploy (automatico al push, oppure "Deploy" manuale).
6. Apri una shell/One-off command su Railway ed esegui una sola volta:
   ```bash
   npm run db:init
   ```
   (in alternativa, esegui lo script localmente puntando temporaneamente
   `DATABASE_URL` all'istanza Railway).
7. In **Settings → Networking**, genera un dominio pubblico.

Il server usa sempre `process.env.PORT` (nessuna porta fissa), quindi
funziona automaticamente con la porta assegnata da Railway.

---

## 7. Struttura del progetto

```text
server.js               Entry point Express
config/database.js      Pool PostgreSQL (DATABASE_URL)
config/mailer.js        Invio email via Gmail API (OAuth2, HTTPS)
middleware/adminAuth.js Protezione rotte admin (sessione)
middleware/validation.js Normalizzazione e validazione RSVP (server-side)
routes/rsvp.js           POST /api/rsvp (transazione + dedup + email)
routes/admin.js          Login/logout/me/stats/rsvps
routes/mail.js            Invio comunicazioni + storico campagne
services/emailService.js Template email (conferma + comunicazioni)
public/                  Frontend statico (HTML/CSS/JS vanilla)
db/init.sql              Schema DB idempotente
scripts/db-init.js        Esegue db/init.sql
scripts/hash-password.js  Genera hash bcrypt per l'admin
```

---

## 8. Come funziona la protezione dai duplicati

Ogni persona registrata (invitato principale o accompagnatore) viene
salvata anche in `attendee_identities` con nome, email e telefono
**normalizzati** (trim, spazi compressi, minuscolo). Su questi tre campi
esistono indici `UNIQUE` a livello di database: anche in caso di due
richieste simultanee per la stessa persona, solo una delle due transazioni
va a buon fine — l'altra riceve una violazione di vincolo univoco che il
server traduce in risposta `409 Conflict` con un messaggio elegante, senza
esporre dati del record esistente.

---

## 9. Note di sicurezza

- Tutte le query usano parametri (`$1, $2, ...`), mai concatenazione di stringhe.
- Le pagine admin non mostrano mai dati senza una sessione valida (401 dalle API).
- Cookie di sessione: `httpOnly`, `secure` in produzione, `sameSite: lax`.
- Rate limiting su `/api/*` e limite piu' stringente su login e RSVP.
- Le comunicazioni massive vengono inviate **una email alla volta** (mai in
  `to`/`cc` multipli): gli invitati non vedono mai gli indirizzi altrui.
- Nessun segreto e' presente nel codice sorgente: tutto arriva da variabili
  d'ambiente, e `.env` e' escluso dal repository.
