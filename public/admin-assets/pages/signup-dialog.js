import { api } from '../lib/api.js';
import { html, mount, $ } from '../lib/dom.js';
import { formDialog, confirmDialog, copyText, info, toast } from '../lib/ui.js';
import { plural } from '../lib/format.js';

const STATE = {
    open: { cls: 'callout-good', icon: 'door-open', text: 'Open: anyone with the link can add themselves to this group.' },
    closed: { cls: '', icon: 'door-closed', text: 'Closed: the link shows that sign-up is closed.' },
    drawn: { cls: 'callout-warn', icon: 'exclamation-triangle', text: 'Paused: the draw has been run, so the link takes no new people until the draw is cleared.' },
};

/** The current group's sign-up link: open or close it, allow new families, copy or replace the link. */
export async function signupDialog() {
    let status = await api('/signup');

    const linkBlock = () => status.url
        ? html`<div class="copy-field"><code title="${status.url}">${status.url}</code>
                <button type="button" class="btn btn-sm" data-signup-copy><i class="bi bi-clipboard"></i>Copy</button>
                <button type="button" class="btn btn-sm" data-signup-new title="Make a new link; the current one stops working"><i class="bi bi-arrow-repeat"></i>New link</button></div>`
        : html`<p class="muted">The link is made when you open sign-up for the first time.</p>`;
    const stateBlock = () => {
        const state = STATE[status.state];
        return html`<div class="callout ${state.cls}"><i class="bi bi-${state.icon}"></i><span>${state.text}
            ${status.signups ? html`<span class="muted"> ${plural(status.signups, 'person', 'people')} signed up with the link so far.</span>` : ''}</span></div>`;
    };

    const saved = await formDialog({
        title: 'Sign-up link',
        submitLabel: 'Save',
        wide: true,
        body: html`
            <div class="stack">
                <p class="muted">Share this link with people who should join this group. They enter their name and e-mail, and pick their family or create a new one.
                    They get their personal link from the draw, like everyone else, and never get admin access this way.</p>
                <div id="signupState">${stateBlock()}</div>
                <label class="switch"><input type="checkbox" name="open" ${status.open ? 'checked' : ''}><span class="track"></span>
                    <span class="label">Sign-up is open ${info('Closes by itself while the draw has been run, so nobody joins after the names are drawn.', { align: 'left' })}</span></label>
                <label class="switch"><input type="checkbox" name="allowNewFamilies" ${status.allowNewFamilies ? 'checked' : ''}><span class="track"></span>
                    <span class="label">People can create a new family ${info('Off: they can only pick one of the families on the Families page, or none.', { align: 'left' })}</span></label>
                <div class="field"><label>Link</label><div id="signupLink">${linkBlock()}</div></div>
            </div>`,
        onOpen: dialog => {
            const repaint = () => {
                mount($('#signupLink', dialog), linkBlock());
                mount($('#signupState', dialog), stateBlock());
            };
            dialog.addEventListener('click', async event => {
                if (event.target.closest('[data-signup-copy]')) {
                    copyText(status.url, 'Sign-up link copied');
                } else if (event.target.closest('[data-signup-new]')) {
                    const ok = await confirmDialog({
                        title: 'Make a new sign-up link?',
                        message: 'The current link stops working at once. People who already signed up stay in the group.',
                        confirmLabel: 'Make new link',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        status = await api('/signup/new-link', { method: 'POST' });
                        repaint();
                        toast('New sign-up link made');
                    } catch (err) {
                        toast(err.message, 'error');
                    }
                }
            });
        },
        onSubmit: form => api('/signup', {
            method: 'PUT',
            body: { open: form.elements.open.checked, allowNewFamilies: form.elements.allowNewFamilies.checked },
        }),
    });
    if (saved?.open && saved.url) {
        copyText(saved.url, 'Sign-up is open, link copied');
    } else if (saved) {
        toast('Sign-up is closed');
    }
    return saved;
}
