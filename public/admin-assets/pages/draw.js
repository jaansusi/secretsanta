import { api } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, confirmDialog, toast, statusIcon, copyText, emptyState, info } from '../lib/ui.js';
import { fmtDateTime } from '../lib/format.js';

const STATE = {
    valid: { icon: 'check-circle-fill', cls: 'callout-good', title: 'Draw is valid' },
    invalid: { icon: 'x-octagon-fill', cls: 'callout-danger', title: 'Draw has problems', help: 'Usually someone was added or removed after drawing. Run the draw again.' },
    not_drawn: { icon: 'hourglass', cls: '', title: 'Not drawn yet' },
};

function mailto(link) {
    const first = link.name.split(/\s+/)[0];
    const subject = encodeURIComponent('Sinu jõululoosi missioon');
    const body = encodeURIComponent(`Tere ${first}!\n\nJõuluvana on sulle missiooni saatnud. Ava see siit:\n${link.url}\n\nÄra seda linki teistele näita.`);
    return `mailto:${encodeURIComponent(link.email || '')}?subject=${subject}&body=${body}`;
}

export async function render(view, { hash }) {
    let status = await api('/draw');
    let links = null;

    const paint = () => {
        const state = STATE[status.state];
        const c = status.constraints;
        mount(view, html`
            ${pageHead({
                title: 'Draw & links',
                help: 'Nobody, including admins, can see who gives to whom here',
                actions: html`<button class="btn btn-primary" id="runDraw" ${c.feasible ? '' : 'disabled'}><i class="bi bi-shuffle"></i>${status.state === 'not_drawn' ? 'Run the draw' : 'Run the draw again'}</button>`,
            })}

            <div class="callout ${state.cls}"><i class="bi bi-${state.icon}"></i><div>
                <strong>${state.title}</strong> · ${status.assigned} of ${status.participants} assigned${state.help ? info(state.help) : ''}
                ${status.lastRun ? html`<div class="muted">Last run ${fmtDateTime(status.lastRun.at)} by ${status.lastRun.by}</div>` : ''}
            </div></div>

            <div class="grid-main-aside">
                <div class="stack">
                    <section class="card">
                        <div class="card-head"><h2>Checks</h2></div>
                        <ul class="list">${status.checks.map(check => html`<li>
                            ${statusIcon(check.status)}
                            <div class="grow"><div class="title">${check.label}</div>${check.detail ? html`<div class="meta">${check.detail}</div>` : ''}</div>
                        </li>`)}</ul>
                    </section>

                    <section class="card" id="links">
                        <div class="card-head"><h2>Personal links ${info('Each link opens one person\'s mission. Links change every time the draw is run, and viewing them is logged.', { align: 'left' })}</h2>
                            ${links ? html`<button class="btn btn-sm" id="copyAll"><i class="bi bi-clipboard"></i>Copy all</button>` : ''}</div>
                        ${status.state === 'not_drawn'
                            ? emptyState('link-45deg', 'No draw yet')
                            : links
                                ? html`<div class="table-wrap"><table class="table">
                                    <thead><tr><th>Participant</th><th>Link</th><th class="right">Send</th></tr></thead>
                                    <tbody>${links.map(link => html`<tr>
                                        <td><span class="primary-cell">${link.name}</span><div class="sub-cell">${link.email || 'No e-mail'}</div></td>
                                        <td>${link.url ? html`<div class="copy-field"><code title="${link.url}">${link.url}</code></div>` : html`<span class="muted">Not in the draw</span>`}</td>
                                        <td class="right nowrap">${link.url ? html`
                                            <button class="btn btn-sm" data-copy="${link.id}"><i class="bi bi-clipboard"></i>Copy</button>
                                            ${link.email ? html`<a class="btn btn-sm" href="${mailto(link)}" data-external><i class="bi bi-envelope"></i>E-mail</a>` : ''}` : ''}</td>
                                    </tr>`)}</tbody></table></div>`
                                : html`<div class="card-body"><button class="btn" id="showLinks"><i class="bi bi-eye"></i>Show links</button></div>`}
                    </section>

                    <section class="card danger-zone">
                        <div class="card-head"><h2>Season actions</h2></div>
                        <div class="row-between"><div><strong>Start a new season</strong>${info('Saves everyone\'s current recipient as "gave to last year", then clears the draw. Do it before next season\'s changes.', { align: 'left' })}</div>
                            <button class="btn btn-danger" id="rollover" ${status.state === 'not_drawn' ? 'disabled' : ''}>Start new season</button></div>
                        <div class="row-between"><div><strong>Clear the draw</strong>${info('Removes all assignments and links without saving anything', { align: 'left' })}</div>
                            <button class="btn btn-danger" id="clearDraw" ${status.state === 'not_drawn' ? 'disabled' : ''}>Clear draw</button></div>
                    </section>
                </div>

                <aside class="stack">
                    <section class="card">
                        <div class="card-head"><h2>Rules</h2><span class="${c.feasible ? 'status-pass' : 'status-fail'}" style="display:inline-flex;gap:6px;align-items:center">${statusIcon(c.feasible ? 'pass' : 'fail')}${c.feasible ? 'Drawable' : 'Not drawable'}</span></div>
                        ${c.warnings.length ? html`<div class="card-body" style="padding-bottom:0"><div class="callout callout-warn"><i class="bi bi-exclamation-triangle"></i><ul style="margin:0">${c.warnings.map(w => html`<li>${w}</li>`)}</ul></div></div>` : ''}
                        <div class="table-wrap"><table class="table">
                            <thead><tr><th>Santa</th><th>Can't give to</th><th class="right">Options ${info('How many people they can be drawn to', { align: 'right', below: true })}</th></tr></thead>
                            <tbody>${c.perParticipant.map(p => html`<tr>
                                <td><a href="/admin/participants/${p.id}">${p.name}</a></td>
                                <td class="sub-cell">${[p.familyName ? `${p.familyName} family` : null, p.lastYearName ? `${p.lastYearName} (last year)` : null].filter(Boolean).join(', ') || 'Only themselves'}</td>
                                <td class="right num">${p.allowed <= 1 ? html`<span class="badge badge-warn">${p.allowed}</span>` : p.allowed}</td>
                            </tr>`)}</tbody>
                        </table></div>
                    </section>
                    <section class="card">
                        <div class="card-head"><h2>Fingerprint ${info('Changes whenever participants or assignments change. Note it after drawing; if it differs later, something was edited.', { align: 'left' })}</h2></div>
                        <div class="card-body"><span class="hash" style="font-size:20px">${status.dbHash}</span></div>
                    </section>
                </aside>
            </div>`);
        if (hash === 'links') $('#links', view)?.scrollIntoView();
        hash = '';
    };
    paint();

    const act = async (path, word, success) => {
        try {
            const result = await api(path, { method: 'POST', body: { confirm: word } });
            status = { ...(result.status ?? result), constraints: (await api('/draw')).constraints };
            links = null;
            toast(success(result));
            paint();
        } catch (err) {
            toast(err.message, 'error');
        }
    };

    on(view, 'click', '#runDraw', async () => {
        const word = await confirmDialog({
            title: status.state === 'not_drawn' ? 'Run the draw?' : 'Run the draw again?',
            message: status.state === 'not_drawn'
                ? 'Every participant gets a recipient and a new personal link.'
                : html`Everyone gets a <strong>new recipient and a new link</strong>. Links you already sent stop working.`,
            typeToConfirm: 'DRAW',
            confirmLabel: 'Run the draw',
            danger: status.state !== 'not_drawn',
        });
        if (word) act('/draw/run', word, () => 'Draw complete. Send everyone their link.');
    });
    on(view, 'click', '#clearDraw', async () => {
        const word = await confirmDialog({ title: 'Clear the draw?', message: 'All assignments and links are removed.', typeToConfirm: 'CLEAR', confirmLabel: 'Clear draw', danger: true });
        if (word) act('/draw/clear', word, () => 'Draw cleared');
    });
    on(view, 'click', '#rollover', async () => {
        const word = await confirmDialog({
            title: 'Start a new season?',
            message: "Each Santa's current recipient is saved as last year's recipient, then the draw is cleared.",
            typeToConfirm: 'NEW SEASON', confirmLabel: 'Start new season', danger: true,
        });
        if (word) act('/draw/rollover', word, result => `Saved ${result.recorded} last-year recipients${result.skipped.length ? `, skipped ${result.skipped.join(', ')}` : ''}`);
    });
    on(view, 'click', '#showLinks', async () => {
        try {
            links = await api('/draw/links');
            paint();
            $('#links', view).scrollIntoView();
        } catch (err) {
            toast(err.message, 'error');
        }
    });
    on(view, 'click', '[data-copy]', (e, button) => {
        const link = links.find(l => String(l.id) === button.dataset.copy);
        copyText(link.url, `Copied ${link.name}'s link`);
    });
    on(view, 'click', '#copyAll', () => copyText(links.filter(l => l.url).map(l => `${l.name}: ${l.url}`).join('\n'), 'All links copied'));
}
