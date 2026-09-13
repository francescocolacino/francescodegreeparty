(function () {
    'use strict';

    var NAME_REGEX = /^[\p{L}\p{M}\s'.-]{1,100}$/u;
    var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var PHONE_REGEX = /^\+?[0-9]{6,15}$/;
    var NOTES_MAX = 1000;

    var form = document.getElementById('rsvp-form');
    var personalFields = document.getElementById('personal-fields');
    var guestQuestion = document.getElementById('guest-question');
    var guestFields = document.getElementById('guest-fields');
    var resultCard = document.getElementById('result-card');
    var rsvpSection = document.getElementById('rsvp-section');
    var submitBtn = document.getElementById('submit-btn');
    var formStatus = document.getElementById('form-status');

    var isSubmitting = false;
    var hasSucceeded = false;

    /* ------------------------------------------------------------------
       Dati evento (da variabili d'ambiente, esposti via /api/event-info)
       ------------------------------------------------------------------ */
    function loadEventInfo() {
        fetch('/api/event-info')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (!data) return;
                setText('event-date', data.date);
                setText('event-time', data.time);
                setText('event-location', data.locationName);

                var addressRow = document.getElementById('event-address-row');
                if (data.address && addressRow) {
                    setText('event-address', data.address);
                    addressRow.hidden = false;
                }

                if (data.name) {
                    document.title = data.name + ' 🎓';
                }

                var noteEl = document.getElementById('event-note');
                if (noteEl && data.note) {
                    noteEl.textContent = data.note;
                    noteEl.hidden = false;
                }

                var mapsLink = document.getElementById('maps-link');
                if (mapsLink) {
                    var isValidHttpUrl = typeof data.mapsUrl === 'string' && /^https?:\/\//i.test(data.mapsUrl);
                    if (isValidHttpUrl) {
                        mapsLink.href = data.mapsUrl;
                        mapsLink.hidden = false;
                    } else if (data.address) {
                        mapsLink.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(data.address);
                        mapsLink.hidden = false;
                    }
                }
            })
            .catch(function () { /* la pagina resta comunque utilizzabile */ });
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value || '—';
    }

    /* ------------------------------------------------------------------
       Card di scelta accessibili (radio nativi, stile a card)
       ------------------------------------------------------------------ */
    function refreshChoiceGroup(name) {
        var inputs = form.querySelectorAll('input[name="' + name + '"]');
        inputs.forEach(function (input) {
            var label = input.closest('.choice-card');
            if (label) label.classList.toggle('is-selected', input.checked);
        });
    }

    form.querySelectorAll('input[name="attendance"]').forEach(function (input) {
        input.addEventListener('change', onAttendanceChange);
    });
    form.querySelectorAll('input[name="hasGuest"]').forEach(function (input) {
        input.addEventListener('change', onGuestChoiceChange);
    });

    function onAttendanceChange(e) {
        refreshChoiceGroup('attendance');
        clearError('attendance');

        personalFields.hidden = false;

        if (e.target.value === 'yes') {
            guestQuestion.hidden = false;
        } else {
            guestQuestion.hidden = true;
            resetGuestRadios();
            hideGuestFields();
        }
    }

    function onGuestChoiceChange(e) {
        refreshChoiceGroup('hasGuest');

        if (e.target.value === 'yes') {
            showGuestFields();
        } else {
            hideGuestFields();
        }
    }

    function resetGuestRadios() {
        form.querySelectorAll('input[name="hasGuest"]').forEach(function (input) {
            input.checked = false;
        });
        refreshChoiceGroup('hasGuest');
    }

    var GUEST_FIELD_IDS = ['guestfirstName', 'guestlastName', 'guestphone', 'guestemail', 'guestnotes'];

    function showGuestFields() {
        guestFields.hidden = false;
        GUEST_FIELD_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.setAttribute('required', 'required');
        });
    }

    function hideGuestFields() {
        guestFields.hidden = true;
        GUEST_FIELD_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.removeAttribute('required');
                el.value = '';
                el.classList.remove('invalid');
            }
            clearError(id);
        });
        clearError('guestGeneral');
    }

    /* ------------------------------------------------------------------
       Validazione client-side (rispecchia le regole server, che restano
       l'unica fonte di verita')
       ------------------------------------------------------------------ */
    function collapseSpaces(str) {
        return String(str || '').trim().replace(/\s+/g, ' ');
    }

    function normalizePhoneClient(str) {
        var trimmed = String(str || '').trim();
        var hasPlus = trimmed.charAt(0) === '+';
        var digits = trimmed.replace(/[^0-9]/g, '');
        return (hasPlus ? '+' : '') + digits;
    }

    function validateNameField(value, label) {
        var v = collapseSpaces(value);
        if (!v) return label + ' e\' obbligatorio.';
        if (v.length > 100) return label + ' e\' troppo lungo.';
        if (!NAME_REGEX.test(v)) return label + ' contiene caratteri non validi.';
        return '';
    }

    function validateEmailField(value) {
        var v = collapseSpaces(value).toLowerCase();
        if (!v) return 'L\'email e\' obbligatoria.';
        if (v.length > 255) return 'L\'email e\' troppo lunga.';
        if (!EMAIL_REGEX.test(v)) return 'Inserisci un indirizzo email valido.';
        return '';
    }

    function validatePhoneField(value) {
        var v = String(value || '').trim();
        if (!v) return 'Il numero di telefono e\' obbligatorio.';
        var normalized = normalizePhoneClient(v);
        if (v.length > 30 || !PHONE_REGEX.test(normalized)) return 'Inserisci un numero di telefono valido.';
        return '';
    }

    function validateNotesField(value) {
        var v = String(value || '').trim();
        if (!v) return 'Questo campo e\' obbligatorio (scrivi "Nessuna" se non ci sono comunicazioni).';
        if (v.length > NOTES_MAX) return 'Il testo e\' troppo lungo (massimo ' + NOTES_MAX + ' caratteri).';
        return '';
    }

    function setError(field, message) {
        var errorEl = document.getElementById('error-' + field);
        var inputEl = document.getElementById(field);
        if (errorEl) errorEl.textContent = message || '';
        if (inputEl) inputEl.classList.toggle('invalid', Boolean(message));
    }

    function clearError(field) {
        setError(field, '');
    }

    function clearAllErrors() {
        form.querySelectorAll('.field-error').forEach(function (el) { el.textContent = ''; });
        form.querySelectorAll('.invalid').forEach(function (el) { el.classList.remove('invalid'); });
    }

    function validatePersonGroup(prefixId, labelPrefix) {
        var get = function (suffix) {
            var el = document.getElementById(prefixId + suffix);
            return el ? el.value : '';
        };

        var errors = {};

        var firstNameErr = validateNameField(get('firstName'), 'Il nome');
        if (firstNameErr) errors[prefixId + 'firstName'] = firstNameErr;

        var lastNameErr = validateNameField(get('lastName'), 'Il cognome');
        if (lastNameErr) errors[prefixId + 'lastName'] = lastNameErr;

        var emailErr = validateEmailField(get('email'));
        if (emailErr) errors[prefixId + 'email'] = emailErr;

        var phoneErr = validatePhoneField(get('phone'));
        if (phoneErr) errors[prefixId + 'phone'] = phoneErr;

        var notesErr = validateNotesField(get('notes'));
        if (notesErr) errors[prefixId + 'notes'] = notesErr;

        return errors;
    }

    function collectFieldValue(id) {
        var el = document.getElementById(id);
        return el ? collapseSpaces(el.value) : '';
    }

    function getCheckedValue(name) {
        var el = form.querySelector('input[name="' + name + '"]:checked');
        return el ? el.value : null;
    }

    /* ------------------------------------------------------------------
       Submit
       ------------------------------------------------------------------ */
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (isSubmitting || hasSucceeded) return;

        clearAllErrors();

        var attendanceValue = getCheckedValue('attendance');
        var errors = {};

        if (!attendanceValue) {
            errors.attendance = 'Indica se sarai presente o meno.';
        }

        Object.assign(errors, validatePersonGroup('', ''));

        var hasGuest = false;
        if (attendanceValue === 'yes') {
            var guestChoice = getCheckedValue('hasGuest');
            hasGuest = guestChoice === 'yes';
            if (hasGuest) {
                Object.assign(errors, validatePersonGroup('guest', ''));
            }
        }

        if (Object.keys(errors).length > 0) {
            Object.keys(errors).forEach(function (field) { setError(field, errors[field]); });
            var firstErrorField = document.getElementById(Object.keys(errors)[0]);
            if (firstErrorField) firstErrorField.focus();
            announce('Controlla i campi evidenziati e riprova.');
            return;
        }

        var payload = {
            attendance: attendanceValue === 'yes',
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            notes: document.getElementById('notes').value,
            hasGuest: hasGuest
        };

        if (hasGuest) {
            payload.guest = {
                firstName: document.getElementById('guestfirstName').value,
                lastName: document.getElementById('guestlastName').value,
                email: document.getElementById('guestemail').value,
                phone: document.getElementById('guestphone').value,
                notes: document.getElementById('guestnotes').value
            };
        }

        submitRsvp(payload);
    });

    function setSubmitting(state) {
        isSubmitting = state;
        submitBtn.disabled = state;
        submitBtn.querySelector('.btn-text').hidden = state;
        submitBtn.querySelector('.btn-loader').hidden = !state;
    }

    function announce(message) {
        if (formStatus) formStatus.textContent = message;
    }

    function submitRsvp(payload) {
        setSubmitting(true);
        announce('Sto registrando la tua risposta...');
        clearError('general');

        fetch('/api/rsvp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) {
                return res.json().then(function (data) { return { status: res.status, body: data }; });
            })
            .then(function (result) {
                if (result.status === 201) {
                    showSuccess(payload.firstName, payload.attendance);
                    return;
                }

                if (result.status === 409) {
                    showDuplicate(result.body && result.body.error);
                    return;
                }

                if (result.status === 422 && result.body && result.body.fields) {
                    Object.keys(result.body.fields).forEach(function (field) {
                        setError(field, result.body.fields[field]);
                    });
                    announce('Controlla i campi evidenziati e riprova.');
                    setSubmitting(false);
                    return;
                }

                var message = (result.body && result.body.error) || 'Si e\' verificato un errore. Riprova piu\' tardi.';
                setError('general', message);
                announce(message);
                setSubmitting(false);
            })
            .catch(function () {
                setError('general', 'Errore di connessione. Controlla la rete e riprova.');
                announce('Errore di connessione.');
                setSubmitting(false);
            });
    }

    function showSuccess(firstName, attendance) {
        hasSucceeded = true;
        form.hidden = true;
        resultCard.hidden = false;
        resultCard.classList.remove('is-error');

        if (attendance) {
            resultCard.innerHTML = '';
            appendResult(resultCard, '🎓', 'Adesione registrata!', [
                'Grazie, ' + firstName + '.',
                'La tua risposta e\' stata salvata correttamente.',
                'Riceverai tra poco una conferma all\'indirizzo email indicato.'
            ]);
        } else {
            appendResult(resultCard, '💌', 'Risposta registrata', [
                'Grazie per avermi fatto sapere.',
                'Mi dispiace che non potrai esserci ❤️'
            ]);
        }

        resultCard.focus();
        announce('La tua risposta e\' stata registrata correttamente.');
    }

    function showDuplicate(message) {
        // Il form resta visibile: potrebbe trattarsi di un errore di battitura
        // nei dati, quindi lasciamo la possibilita' di correggere e reinviare.
        setError('general', message || 'Risulta gia\' registrata una partecipazione con questi dati. Se devi modificarla, contatta Francesco.');
        announce('Adesione gia\' presente.');
        var generalError = document.getElementById('error-general');
        if (generalError) generalError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setSubmitting(false);
    }

    function appendResult(container, icon, title, paragraphs) {
        var iconEl = document.createElement('div');
        iconEl.className = 'result-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = icon;
        container.appendChild(iconEl);

        var titleEl = document.createElement('h2');
        titleEl.textContent = title;
        container.appendChild(titleEl);

        paragraphs.forEach(function (text) {
            var p = document.createElement('p');
            p.textContent = text;
            container.appendChild(p);
        });
    }

    loadEventInfo();
})();
