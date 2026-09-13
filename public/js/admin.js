(function () {
    'use strict';

    var FILTER_LABELS = {
        attendees: 'Solo partecipanti',
        all: 'Tutti gli RSVP',
        absent: 'Solo assenti'
    };

    var loadingView = document.getElementById('loading-view');
    var loginView = document.getElementById('login-view');
    var dashboardView = document.getElementById('dashboard-view');

    var loginForm = document.getElementById('login-form');
    var loginError = document.getElementById('login-error');
    var loginSubmit = document.getElementById('login-submit');
    var logoutBtn = document.getElementById('logout-btn');

    var campaignForm = document.getElementById('campaign-form');
    var campaignMessage = document.getElementById('campaign-message');
    var campaignCharcount = document.getElementById('campaign-charcount');
    var campaignSubmit = document.getElementById('campaign-submit');
    var campaignResult = document.getElementById('campaign-result');

    var confirmModal = document.getElementById('confirm-modal');
    var confirmModalText = document.getElementById('confirm-modal-text');
    var confirmModalConfirm = document.getElementById('confirm-modal-confirm');
    var confirmModalCancel = document.getElementById('confirm-modal-cancel');

    var editModal = document.getElementById('edit-modal');
    var editForm = document.getElementById('edit-form');
    var editCancel = document.getElementById('edit-cancel');
    var editSave = document.getElementById('edit-save');
    var editError = document.getElementById('edit-error');
    var editHasGuest = document.getElementById('edit-hasGuest');
    var editGuestFields = document.getElementById('edit-guest-fields');

    var deleteModal = document.getElementById('delete-modal');
    var deleteCancel = document.getElementById('delete-cancel');
    var deleteConfirm = document.getElementById('delete-confirm');

    var pendingCampaignPayload = null;
    var pendingDeleteId = null;
    var currentRsvps = [];

    /* ------------------------------------------------------------------
       Vista: login / dashboard / caricamento
       ------------------------------------------------------------------ */
    function showView(view) {
        loadingView.hidden = view !== 'loading';
        loginView.hidden = view !== 'login';
        dashboardView.hidden = view !== 'dashboard';
    }

    function checkAuth() {
        fetch('/api/admin/me')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && data.authenticated) {
                    showView('dashboard');
                    loadDashboardData();
                } else {
                    showView('login');
                }
            })
            .catch(function () {
                showView('login');
            });
    }

    function handleUnauthorized() {
        showView('login');
        setLoginError('La sessione e\' scaduta. Accedi di nuovo.');
    }

    function setLoginError(message) {
        loginError.textContent = message || '';
    }

    function setButtonLoading(btn, loading) {
        btn.disabled = loading;
        btn.querySelector('.btn-text').hidden = loading;
        btn.querySelector('.btn-loader').hidden = !loading;
    }

    /* ------------------------------------------------------------------
       Login / Logout
       ------------------------------------------------------------------ */
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        setLoginError('');
        setButtonLoading(loginSubmit, true);

        var username = document.getElementById('login-username').value;
        var password = document.getElementById('login-password').value;

        fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        })
            .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
            .then(function (result) {
                setButtonLoading(loginSubmit, false);
                if (result.status === 200) {
                    document.getElementById('login-password').value = '';
                    showView('dashboard');
                    loadDashboardData();
                } else {
                    setLoginError((result.body && result.body.error) || 'Credenziali non valide.');
                }
            })
            .catch(function () {
                setButtonLoading(loginSubmit, false);
                setLoginError('Errore di connessione. Riprova.');
            });
    });

    logoutBtn.addEventListener('click', function () {
        fetch('/api/admin/logout', { method: 'POST' })
            .finally(function () {
                showView('login');
                loginForm.reset();
            });
    });

    /* ------------------------------------------------------------------
       Caricamento dati dashboard
       ------------------------------------------------------------------ */
    function loadDashboardData() {
        loadStats();
        loadRsvps();
        loadHistory();
    }

    function adminFetch(url, options) {
        return fetch(url, options).then(function (res) {
            if (res.status === 401) {
                handleUnauthorized();
                throw new Error('unauthorized');
            }
            return res;
        });
    }

    function loadStats() {
        adminFetch('/api/admin/stats')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                setStat('stat-total', data.totalRsvps);
                setStat('stat-present', data.totalPresent);
                setStat('stat-main-present', data.mainPresent);
                setStat('stat-guests', data.guestCount);
                setStat('stat-absent', data.absent);
            })
            .catch(function () { /* gestito da adminFetch o rete non disponibile */ });
    }

    function setStat(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = (typeof value === 'number') ? String(value) : '—';
    }

    /* ------------------------------------------------------------------
       Elenco adesioni
       ------------------------------------------------------------------ */
    function loadRsvps() {
        var loadingEl = document.getElementById('rsvp-loading');
        var emptyEl = document.getElementById('rsvp-empty');
        var tableWrap = document.getElementById('rsvp-table-wrap');
        var cardsWrap = document.getElementById('rsvp-cards');

        loadingEl.hidden = false;
        emptyEl.hidden = true;
        tableWrap.hidden = true;
        cardsWrap.hidden = true;

        adminFetch('/api/admin/rsvps')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                loadingEl.hidden = true;
                var rsvps = data.rsvps || [];
                currentRsvps = rsvps;

                if (rsvps.length === 0) {
                    emptyEl.hidden = false;
                    return;
                }

                renderRsvpTable(rsvps);
                renderRsvpCards(rsvps);
                tableWrap.hidden = false;
                cardsWrap.hidden = false;
            })
            .catch(function () {
                loadingEl.hidden = true;
            });
    }

    function formatDate(iso) {
        try {
            return new Date(iso).toLocaleString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return iso;
        }
    }

    function formatLastSent(iso) {
        return iso ? formatDate(iso) : 'Mai inviata';
    }

    function el(tag, opts) {
        var node = document.createElement(tag);
        opts = opts || {};
        if (opts.text !== undefined) node.textContent = opts.text;
        if (opts.className) node.className = opts.className;
        if (opts.attrs) {
            Object.keys(opts.attrs).forEach(function (k) { node.setAttribute(k, opts.attrs[k]); });
        }
        return node;
    }

    function attendanceBadge(attendance) {
        return el('span', {
            className: 'badge ' + (attendance ? 'badge-present' : 'badge-absent'),
            text: attendance ? 'PRESENTE' : 'ASSENTE'
        });
    }

    function guestDetailFragment(guest) {
        var box = el('div', { className: 'guest-detail-box' });
        var rows = [
            ['Nome', guest.firstName],
            ['Cognome', guest.lastName],
            ['Telefono', guest.phone],
            ['Email', guest.email],
            ['Note / allergie', guest.notes]
        ];
        rows.forEach(function (pair) {
            var line = el('div');
            var strong = el('strong', { text: pair[0] + ': ' });
            line.appendChild(strong);
            line.appendChild(document.createTextNode(pair[1] || ''));
            box.appendChild(line);
        });
        return box;
    }

    /**
     * Crea i tre bottoni azione (Modifica / Elimina / Reinvia mail)
     * condivisi da tabella desktop e card mobile.
     */
    function buildActionButtons(rsvp) {
        var wrap = el('div', { className: 'action-buttons' });

        var editBtn = el('button', { text: 'Modifica', className: 'action-btn', attrs: { type: 'button' } });
        editBtn.addEventListener('click', function () { openEditModal(rsvp.id); });

        var resendBtn = el('button', { text: 'Reinvia mail', className: 'action-btn', attrs: { type: 'button' } });
        resendBtn.addEventListener('click', function () { handleResend(rsvp.id, resendBtn); });

        var deleteBtn = el('button', { text: 'Elimina', className: 'action-btn action-btn-danger', attrs: { type: 'button' } });
        deleteBtn.addEventListener('click', function () { openDeleteModal(rsvp.id, rsvp.firstName + ' ' + rsvp.lastName); });

        wrap.appendChild(editBtn);
        wrap.appendChild(resendBtn);
        wrap.appendChild(deleteBtn);
        return wrap;
    }

    function renderRsvpTable(rsvps) {
        var tbody = document.getElementById('rsvp-tbody');
        tbody.textContent = '';

        rsvps.forEach(function (r) {
            var tr = el('tr');
            tr.appendChild(el('td', { text: String(r.number) }));
            tr.appendChild(el('td', { text: formatDate(r.createdAt) }));
            tr.appendChild(el('td', { text: r.firstName }));
            tr.appendChild(el('td', { text: r.lastName }));

            var presenceTd = el('td');
            presenceTd.appendChild(attendanceBadge(r.attendance));
            tr.appendChild(presenceTd);

            tr.appendChild(el('td', { text: r.phone }));
            tr.appendChild(el('td', { text: r.email }));
            tr.appendChild(el('td', { text: r.notes, className: 'wrap' }));

            var guestTd = el('td');
            var detailRow = null;

            if (r.hasGuest && r.guest) {
                guestTd.appendChild(el('span', { className: 'badge badge-guest', text: '+1' }));
                var expandBtn = el('button', {
                    text: 'Dettagli',
                    className: 'expand-btn',
                    attrs: { type: 'button', 'aria-expanded': 'false' }
                });
                guestTd.appendChild(expandBtn);

                detailRow = el('tr', { className: 'guest-detail-row' });
                detailRow.hidden = true;
                var detailTd = el('td', { attrs: { colspan: '11' } });
                detailTd.appendChild(guestDetailFragment(r.guest));
                detailRow.appendChild(detailTd);

                expandBtn.addEventListener('click', function () {
                    var isHidden = detailRow.hidden;
                    detailRow.hidden = !isHidden;
                    expandBtn.setAttribute('aria-expanded', String(isHidden));
                    expandBtn.textContent = isHidden ? 'Nascondi' : 'Dettagli';
                });
            } else {
                guestTd.appendChild(document.createTextNode('—'));
            }
            tr.appendChild(guestTd);

            tr.appendChild(el('td', {
                text: formatLastSent(r.lastEmailSentAt),
                className: 'last-sent' + (r.lastEmailSentAt ? '' : ' last-sent-never')
            }));

            var actionsTd = el('td');
            actionsTd.appendChild(buildActionButtons(r));
            tr.appendChild(actionsTd);

            tbody.appendChild(tr);
            if (detailRow) tbody.appendChild(detailRow);
        });
    }

    function renderRsvpCards(rsvps) {
        var container = document.getElementById('rsvp-cards');
        container.textContent = '';

        rsvps.forEach(function (r) {
            var card = el('div', { className: 'rsvp-card' });

            var top = el('div', { className: 'rsvp-card-top' });
            var nameWrap = el('div');
            nameWrap.appendChild(el('div', { className: 'rsvp-card-name', text: r.firstName + ' ' + r.lastName }));
            nameWrap.appendChild(el('div', { className: 'rsvp-card-num', text: '#' + r.number + ' · ' + formatDate(r.createdAt) }));
            top.appendChild(nameWrap);
            top.appendChild(attendanceBadge(r.attendance));
            card.appendChild(top);

            var dl = el('dl');
            var addRow = function (label, value) {
                dl.appendChild(el('dt', { text: label }));
                dl.appendChild(el('dd', { text: value || '—' }));
            };
            addRow('Telefono', r.phone);
            addRow('Email', r.email);
            addRow('Note', r.notes);
            addRow('Ultimo invio', formatLastSent(r.lastEmailSentAt));
            card.appendChild(dl);

            if (r.hasGuest && r.guest) {
                card.appendChild(el('span', { className: 'badge badge-guest badge-guest-block', text: '+1 accompagnatore' }));
                card.appendChild(guestDetailFragment(r.guest));
            }

            var actionsWrap = el('div', { className: 'rsvp-card-actions' });
            actionsWrap.appendChild(buildActionButtons(r));
            card.appendChild(actionsWrap);

            container.appendChild(card);
        });
    }

    /* ------------------------------------------------------------------
       Modifica adesione
       ------------------------------------------------------------------ */
    function findRsvpById(id) {
        for (var i = 0; i < currentRsvps.length; i++) {
            if (currentRsvps[i].id === id) return currentRsvps[i];
        }
        return null;
    }

    function setEditGuestFieldsRequired(required) {
        ['edit-guestFirstName', 'edit-guestLastName', 'edit-guestPhone', 'edit-guestEmail'].forEach(function (id) {
            var input = document.getElementById(id);
            if (!input) return;
            if (required) input.setAttribute('required', 'required');
            else input.removeAttribute('required');
        });
    }

    editHasGuest.addEventListener('change', function () {
        editGuestFields.hidden = !editHasGuest.checked;
        setEditGuestFieldsRequired(editHasGuest.checked);
        if (!editHasGuest.checked) {
            ['edit-guestFirstName', 'edit-guestLastName', 'edit-guestPhone', 'edit-guestEmail', 'edit-guestNotes'].forEach(function (id) {
                var input = document.getElementById(id);
                if (input) input.value = '';
            });
        }
    });

    function openEditModal(id) {
        var rsvp = findRsvpById(id);
        if (!rsvp) return;

        editError.textContent = '';
        document.getElementById('edit-id').value = String(rsvp.id);
        document.getElementById('edit-attendance').value = rsvp.attendance ? 'true' : 'false';
        document.getElementById('edit-firstName').value = rsvp.firstName || '';
        document.getElementById('edit-lastName').value = rsvp.lastName || '';
        document.getElementById('edit-phone').value = rsvp.phone || '';
        document.getElementById('edit-email').value = rsvp.email || '';
        document.getElementById('edit-notes').value = rsvp.notes || '';

        var hasGuest = Boolean(rsvp.hasGuest && rsvp.guest);
        editHasGuest.checked = hasGuest;
        editGuestFields.hidden = !hasGuest;
        setEditGuestFieldsRequired(hasGuest);

        document.getElementById('edit-guestFirstName').value = hasGuest ? rsvp.guest.firstName || '' : '';
        document.getElementById('edit-guestLastName').value = hasGuest ? rsvp.guest.lastName || '' : '';
        document.getElementById('edit-guestPhone').value = hasGuest ? rsvp.guest.phone || '' : '';
        document.getElementById('edit-guestEmail').value = hasGuest ? rsvp.guest.email || '' : '';
        document.getElementById('edit-guestNotes').value = hasGuest ? rsvp.guest.notes || '' : '';

        editModal.hidden = false;
    }

    function closeEditModal() {
        editModal.hidden = true;
        editForm.reset();
    }

    editCancel.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', function (e) {
        if (e.target === editModal) closeEditModal();
    });

    editForm.addEventListener('submit', function (e) {
        e.preventDefault();
        editError.textContent = '';

        var id = document.getElementById('edit-id').value;
        var hasGuest = editHasGuest.checked;

        var payload = {
            attendance: document.getElementById('edit-attendance').value === 'true',
            firstName: document.getElementById('edit-firstName').value,
            lastName: document.getElementById('edit-lastName').value,
            email: document.getElementById('edit-email').value,
            phone: document.getElementById('edit-phone').value,
            notes: document.getElementById('edit-notes').value,
            hasGuest: hasGuest
        };

        if (hasGuest) {
            payload.guest = {
                firstName: document.getElementById('edit-guestFirstName').value,
                lastName: document.getElementById('edit-guestLastName').value,
                email: document.getElementById('edit-guestEmail').value,
                phone: document.getElementById('edit-guestPhone').value,
                notes: document.getElementById('edit-guestNotes').value
            };
        }

        setButtonLoading(editSave, true);

        adminFetch('/api/admin/rsvps/' + encodeURIComponent(id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
            .then(function (result) {
                setButtonLoading(editSave, false);
                if (result.status === 200) {
                    closeEditModal();
                    loadRsvps();
                    loadStats();
                } else {
                    editError.textContent = (result.body && result.body.error) || 'Errore durante il salvataggio.';
                }
            })
            .catch(function (err) {
                setButtonLoading(editSave, false);
                if (err.message !== 'unauthorized') {
                    editError.textContent = 'Errore di connessione. Riprova.';
                }
            });
    });

    /* ------------------------------------------------------------------
       Elimina adesione
       ------------------------------------------------------------------ */
    function openDeleteModal(id, label) {
        pendingDeleteId = id;
        var textEl = document.getElementById('delete-modal-text');
        textEl.textContent = 'Stai per eliminare definitivamente l\'adesione di ' + label + ' (e l\'eventuale accompagnatore). Questa azione e\' irreversibile.';
        deleteModal.hidden = false;
        deleteConfirm.focus();
    }

    function closeDeleteModal() {
        deleteModal.hidden = true;
        pendingDeleteId = null;
    }

    deleteCancel.addEventListener('click', closeDeleteModal);
    deleteModal.addEventListener('click', function (e) {
        if (e.target === deleteModal) closeDeleteModal();
    });

    deleteConfirm.addEventListener('click', function () {
        if (!pendingDeleteId) {
            closeDeleteModal();
            return;
        }
        var id = pendingDeleteId;
        deleteConfirm.disabled = true;

        adminFetch('/api/admin/rsvps/' + encodeURIComponent(id), { method: 'DELETE' })
            .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
            .then(function (result) {
                deleteConfirm.disabled = false;
                closeDeleteModal();
                if (result.status === 200) {
                    loadRsvps();
                    loadStats();
                }
            })
            .catch(function () {
                deleteConfirm.disabled = false;
                closeDeleteModal();
            });
    });

    /* ------------------------------------------------------------------
       Reinvia email di conferma
       ------------------------------------------------------------------ */
    function handleResend(id, btn) {
        btn.disabled = true;
        var originalText = btn.textContent;
        btn.textContent = 'Invio...';

        adminFetch('/api/admin/rsvps/' + encodeURIComponent(id) + '/resend-email', { method: 'POST' })
            .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
            .then(function (result) {
                if (result.status === 200) {
                    loadRsvps();
                } else {
                    btn.disabled = false;
                    btn.textContent = 'Errore, riprova';
                    setTimeout(function () { btn.textContent = originalText; }, 3000);
                }
            })
            .catch(function (err) {
                if (err.message === 'unauthorized') return;
                btn.disabled = false;
                btn.textContent = 'Errore, riprova';
                setTimeout(function () { btn.textContent = originalText; }, 3000);
            });
    }

    /* ------------------------------------------------------------------
       Invia comunicazione
       ------------------------------------------------------------------ */
    campaignMessage.addEventListener('input', function () {
        campaignCharcount.textContent = String(campaignMessage.value.length);
    });

    campaignForm.addEventListener('submit', function (e) {
        e.preventDefault();
        hideCampaignResult();

        var filter = document.getElementById('campaign-filter').value;
        var subject = document.getElementById('campaign-subject').value.trim();
        var message = campaignMessage.value.trim();

        if (!subject || !message) {
            showCampaignResult('Compila oggetto e messaggio prima di inviare.', true);
            return;
        }

        pendingCampaignPayload = { recipientFilter: filter, subject: subject, message: message };

        adminFetch('/api/admin/email/recipients-count?filter=' + encodeURIComponent(filter))
            .then(function (res) { return res.json(); })
            .then(function (data) {
                openConfirmModal(data.count || 0);
            })
            .catch(function () { /* gestito da adminFetch */ });
    });

    function openConfirmModal(count) {
        confirmModalText.textContent = 'Stai per inviare questa comunicazione a ' + count + ' ' + (count === 1 ? 'persona' : 'persone') + '.';
        confirmModal.hidden = false;
        confirmModalConfirm.focus();
    }

    function closeConfirmModal() {
        confirmModal.hidden = true;
    }

    confirmModalCancel.addEventListener('click', function () {
        pendingCampaignPayload = null;
        closeConfirmModal();
    });

    confirmModal.addEventListener('click', function (e) {
        if (e.target === confirmModal) {
            pendingCampaignPayload = null;
            closeConfirmModal();
        }
    });

    confirmModalConfirm.addEventListener('click', function () {
        if (!pendingCampaignPayload) {
            closeConfirmModal();
            return;
        }
        var payload = pendingCampaignPayload;
        pendingCampaignPayload = null;
        closeConfirmModal();
        sendCampaign(payload);
    });

    function sendCampaign(payload) {
        setButtonLoading(campaignSubmit, true);

        loadHistory(true).then(function (previousCount) {
            var baseline = previousCount || 0;

            return adminFetch('/api/admin/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
                .then(function (res) { return res.json().then(function (body) { return { status: res.status, body: body }; }); })
                .then(function (result) {
                    setButtonLoading(campaignSubmit, false);
                    if (result.status === 202) {
                        var total = result.body.total || 0;
                        showCampaignResult(
                            total > 0
                                ? 'Invio avviato per ' + total + ' ' + (total === 1 ? 'persona' : 'persone') + '. Il risultato comparira\' a breve nello storico qui sotto.'
                                : 'Nessun destinatario trovato per questo filtro.',
                            false
                        );
                        campaignForm.reset();
                        campaignCharcount.textContent = '0';
                        if (total > 0) pollHistoryAfterSend(baseline);
                    } else {
                        showCampaignResult((result.body && result.body.error) || 'Errore durante l\'invio.', true);
                    }
                });
        }).catch(function (err) {
            setButtonLoading(campaignSubmit, false);
            if (err.message !== 'unauthorized') {
                showCampaignResult('Errore di connessione durante l\'invio.', true);
            }
        });
    }

    function pollHistoryAfterSend(previousCount) {
        var attempts = 0;
        var maxAttempts = 12;
        var interval = setInterval(function () {
            attempts++;
            loadHistory(true).then(function (count) {
                if ((count !== null && count > previousCount) || attempts >= maxAttempts) {
                    clearInterval(interval);
                }
            });
        }, 4000);
    }

    function showCampaignResult(message, isError) {
        campaignResult.hidden = false;
        campaignResult.textContent = message;
        campaignResult.classList.toggle('is-error', Boolean(isError));
    }

    function hideCampaignResult() {
        campaignResult.hidden = true;
        campaignResult.textContent = '';
        campaignResult.classList.remove('is-error');
    }

    /* ------------------------------------------------------------------
       Storico comunicazioni
       ------------------------------------------------------------------ */
    function loadHistory(quiet) {
        var loadingEl = document.getElementById('history-loading');
        var emptyEl = document.getElementById('history-empty');
        var listEl = document.getElementById('history-list');

        if (!quiet) {
            loadingEl.hidden = false;
            emptyEl.hidden = true;
            listEl.hidden = true;
        }

        return adminFetch('/api/admin/email/history')
            .then(function (res) { return res.json(); })
            .then(function (data) {
                loadingEl.hidden = true;
                var campaigns = data.campaigns || [];
                listEl.textContent = '';

                if (campaigns.length === 0) {
                    emptyEl.hidden = false;
                    listEl.hidden = true;
                    return campaigns.length;
                }

                emptyEl.hidden = true;
                campaigns.forEach(function (c) {
                    var item = el('div', { className: 'history-item' });

                    var left = el('div');
                    left.appendChild(el('div', { className: 'history-subject', text: c.subject }));
                    left.appendChild(el('div', {
                        className: 'history-meta',
                        text: formatDate(c.created_at) + ' · ' + (FILTER_LABELS[c.recipient_filter] || c.recipient_filter)
                    }));

                    var right = el('div', {
                        className: 'history-meta',
                        text: 'Inviate: ' + c.success_count + ' · Errori: ' + c.failure_count + ' · Totale: ' + c.recipient_count
                    });

                    item.appendChild(left);
                    item.appendChild(right);
                    listEl.appendChild(item);
                });

                listEl.hidden = false;
                return campaigns.length;
            })
            .catch(function () {
                loadingEl.hidden = true;
                return null;
            });
    }

    checkAuth();
})();
