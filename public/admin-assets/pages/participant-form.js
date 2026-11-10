import { html } from '../lib/dom.js';
import { selectOptions, info } from '../lib/ui.js';

/** Profile fields shared by the "add participant" dialog and the participant page. */
export function profileFields(participant, { families, participants }) {
    const others = participants.filter(p => p.id !== participant?.id);
    return html`
        <div class="form-grid">
            <div class="field">
                <label for="pf-name">Name ${info('Shown to their Santa exactly like this', { align: 'left' })}</label>
                <input type="text" id="pf-name" name="name" required maxlength="100" value="${participant?.name ?? ''}" autocomplete="off">
            </div>
            <div class="field">
                <label for="pf-email">E-mail ${info('Google account used to sign in', { align: 'left' })}</label>
                <input type="email" id="pf-email" name="email" maxlength="200" value="${participant?.email ?? ''}" autocomplete="off">
            </div>
            <div class="field">
                <label for="pf-family">Family ${info('Never drawn to give within the same family', { align: 'left' })}</label>
                <select id="pf-family" name="familyId">${selectOptions(families.map(f => ({ value: f.id, label: f.name })), participant?.familyId, { empty: 'No family' })}</select>
            </div>
            <div class="field">
                <label for="pf-lastyear">Gave to last year ${info('Not drawn to the same person again', { align: 'left' })}</label>
                <select id="pf-lastyear" name="lastYearGiftingToId">${selectOptions(others.map(p => ({ value: p.id, label: p.name })), participant?.lastYearGiftingToId, { empty: 'Nobody / unknown' })}</select>
            </div>
            <label class="check full">
                <input type="checkbox" name="isAdmin" ${participant?.isAdmin ? 'checked' : ''}>
                <span class="label">Admin access ${info('Can sign in to this panel with Google', { align: 'left' })}</span>
            </label>
        </div>`;
}

export function readProfile(form) {
    const data = new FormData(form);
    const id = value => (value ? parseInt(value, 10) : null);
    return {
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim(),
        familyId: id(data.get('familyId')),
        lastYearGiftingToId: id(data.get('lastYearGiftingToId')),
        isAdmin: data.get('isAdmin') === 'on',
    };
}
