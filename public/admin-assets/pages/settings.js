import { api } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, toast, setDirty, info } from '../lib/ui.js';

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
        </form>`);
    draw();

    const setFormDirty = value => {
        setDirty(value);
        view.querySelector('button[type=submit]').disabled = !value;
        $('#resetSettings', view).disabled = !value;
    };
    on(view, 'input', '#settingsForm', () => setFormDirty(true));
    on(view, 'change', '#settingsForm', () => setFormDirty(true));
    on(view, 'click', '#resetSettings', () => { draw(); setDirty(false); });
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
