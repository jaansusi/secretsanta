import { api } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, toast, setDirty, info, confirmDialog } from '../lib/ui.js';
import { plural } from '../lib/format.js';

export async function render(view) {
    let settings = await api('/settings');

    const draw = () => mount(view, html`
        ${pageHead({ title: 'Settings' })}
        <form id="settingsForm" class="stack" novalidate>
            <section class="card">
                <div class="card-head"><h2>Missions</h2></div>
                <div class="card-body stack">
                    <label class="switch"><input type="checkbox" name="revealOpen" ${settings.revealOpen ? 'checked' : ''}><span class="track"></span>
                        <span class="label">Participants can open their mission ${info('When off, opening the mission shows the message below. Admins can always open theirs.', { align: 'left' })}</span></label>
                    <div class="field">
                        <label for="revealClosedMessage">Message while closed</label>
                        <textarea id="revealClosedMessage" name="revealClosedMessage" rows="2" maxlength="500">${settings.revealClosedMessage}</textarea>
                    </div>
                </div>
            </section>
            <section class="card">
                <div class="card-head"><h2>Season</h2></div>
                <div class="card-body form-grid">
                    <div class="field"><label for="exchangeDate">Gift exchange date</label><input type="date" id="exchangeDate" name="exchangeDate" value="${settings.exchangeDate}"></div>
                    <div class="field"><label for="giftBudget">Gift budget</label><input type="text" id="giftBudget" name="giftBudget" maxlength="100" placeholder="e.g. 30 €" value="${settings.giftBudget}"></div>
                    <div class="field"><label for="agencyFactsPerDossier">Agency facts per dossier</label><input type="number" id="agencyFactsPerDossier" name="agencyFactsPerDossier" min="0" max="10" step="1" value="${settings.agencyFactsPerDossier}"></div>
                </div>
            </section>
            <section class="card">
                <div class="card-head"><h2>Santa's letter</h2><a class="btn btn-sm btn-ghost" href="/kiri" target="_blank" rel="noopener">Open<i class="bi bi-box-arrow-up-right"></i></a></div>
                <div class="card-body field">
                    <label for="letterUrl">Google Doc URL ${info(settings.letterUrlFallback ? 'Leave empty to use GOOGLE_DOC_LETTER_LINK from the server environment' : "Use the document's embeddable preview link", { align: 'left' })}</label>
                    <input type="url" id="letterUrl" name="letterUrl" maxlength="1000" placeholder="${settings.letterUrlFallback || 'https://docs.google.com/document/d/…/preview'}" value="${settings.letterUrl}">
                </div>
            </section>
            <section class="card">
                <div class="card-head"><h2>Organiser notes ${info('Only visible in this panel', { align: 'left' })}</h2></div>
                <div class="card-body"><textarea name="adminNotes" rows="5" maxlength="5000" aria-label="Organiser notes">${settings.adminNotes}</textarea></div>
            </section>
            <div class="savebar"><button type="button" class="btn" id="resetSettings" disabled>Discard changes</button><button type="submit" class="btn btn-primary" disabled>Save settings</button></div>
        </form>
        <section class="card" id="importCard">
            <div class="card-head"><h2>Import data ${info('Adds or updates families and participants from a Secret Santa data file (JSON). People are matched by e-mail, then by name. Nothing that is not in the file is changed or deleted.', { align: 'left' })}</h2></div>
            <div class="card-body stack">
                <div class="field">
                    <label for="importFile">Data file</label>
                    <input type="file" id="importFile" accept=".json,application/json">
                </div>
                <div id="importResult"></div>
            </div>
        </section>`);
    draw();

    const setFormDirty = value => {
        setDirty(value);
        view.querySelector('button[type=submit]').disabled = !value;
        $('#resetSettings', view).disabled = !value;
    };
    on(view, 'input', '#settingsForm', () => setFormDirty(true));
    on(view, 'change', '#settingsForm', () => setFormDirty(true));
    on(view, 'click', '#resetSettings', () => { draw(); setDirty(false); });

    // Import: choosing a file runs a dry run and shows what would change; the button applies it.
    const importFile = () => $('#importFile', view).files?.[0] ?? null;
    const showImport = content => mount($('#importResult', view), content);
    const sendImport = dryRun => {
        const form = new FormData();
        form.append('file', importFile());
        return api('/import' + (dryRun ? '?dryRun=true' : ''), { method: 'POST', form });
    };
    on(view, 'change', '#importFile', async () => {
        if (!importFile()) { showImport(''); return; }
        showImport(html`<p class="muted">Checking the file…</p>`);
        try {
            const preview = await sendImport(true);
            showImport(html`${importSummary(preview)}
                <div><button type="button" class="btn btn-primary" id="importRun"><i class="bi bi-box-arrow-in-down"></i>Import</button></div>`);
        } catch (err) {
            showImport(importErrors(err));
        }
    });
    on(view, 'click', '#importRun', async (event, button) => {
        const ok = await confirmDialog({
            title: 'Import data',
            message: 'Apply the changes listed on the page? Participants that are updated take every field from the file, including their current assignment.',
            confirmLabel: 'Import',
        });
        if (!ok) return;
        button.disabled = true;
        try {
            const result = await sendImport(false);
            $('#importFile', view).value = '';
            showImport(importSummary(result));
            toast('Import finished');
        } catch (err) {
            button.disabled = false;
            showImport(importErrors(err));
        }
    });
    on(view, 'submit', '#settingsForm', async event => {
        event.preventDefault();
        const form = event.target;
        const data = new FormData(form);
        try {
            settings = await api('/settings', {
                method: 'PUT',
                body: {
                    revealOpen: data.get('revealOpen') === 'on',
                    revealClosedMessage: String(data.get('revealClosedMessage')),
                    exchangeDate: String(data.get('exchangeDate')),
                    giftBudget: String(data.get('giftBudget')),
                    letterUrl: String(data.get('letterUrl')),
                    adminNotes: String(data.get('adminNotes')),
                    agencyFactsPerDossier: parseInt(String(data.get('agencyFactsPerDossier')), 10) || 0,
                },
            });
            setDirty(false);
            draw();
            toast('Settings saved');
        } catch (err) {
            toast(err.message, 'error');
        }
    });
    return () => setDirty(false);
}

function importSummary(result) {
    const list = names => names.length ? names.join(', ') : html`<span class="muted">none</span>`;
    return html`
        <div class="callout ${result.dryRun ? '' : 'callout-good'}"><i class="bi bi-${result.dryRun ? 'info-circle' : 'check-circle'}"></i>
            <span>${result.dryRun ? 'Nothing has changed yet. The import will:' : 'Imported:'}
                ${result.source ? html` <span class="muted">(${result.source}${result.exportedAt ? `, ${result.exportedAt.slice(0, 10)}` : ''})</span>` : ''}</span></div>
        <dl class="kv">
            <dt>New participants</dt><dd>${result.participants.created.length}</dd>
            <dt>Updated participants</dt><dd>${result.participants.updated.length}</dd>
            <dt>New families</dt><dd>${result.families.created.length}</dd>
            <dt>Existing families</dt><dd>${result.families.existing.length}</dd>
            <dt>Assignments</dt><dd>${plural(result.assignments, 'participant')}</dd>
        </dl>
        <dl class="kv">
            <dt>New</dt><dd>${list(result.participants.created)}</dd>
            <dt>Updated</dt><dd>${list(result.participants.updated)}</dd>
            <dt>Families</dt><dd>${list([...result.families.created, ...result.families.existing])}</dd>
            <dt>Admins</dt><dd>${list(result.admins)}</dd>
        </dl>
        ${result.warnings.length ? html`<div class="callout callout-warn"><i class="bi bi-exclamation-triangle"></i><ul style="margin:0;padding-left:16px">${result.warnings.map(w => html`<li>${w}</li>`)}</ul></div>` : ''}`;
}

function importErrors(err) {
    const problems = err.details ?? [err.message];
    return html`<div class="callout callout-danger"><i class="bi bi-exclamation-octagon"></i>
        <span>The file was not imported. ${problems.length > 1 ? 'Problems:' : ''}
            <ul style="margin:4px 0 0;padding-left:16px">${problems.map(p => html`<li>${p}</li>`)}</ul></span></div>`;
}
