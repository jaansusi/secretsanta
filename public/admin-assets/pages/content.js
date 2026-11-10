import { api } from '../lib/api.js';
import { html, mount, $ } from '../lib/dom.js';
import { pageHead, meter } from '../lib/ui.js';
import { dataTable } from '../lib/table.js';
import { navigate, setQuery } from '../lib/router.js';

const PARTS = [
    { key: 'codename', label: 'Codename', has: p => !!p.dossier.codename },
    { key: 'brief', label: 'Mission brief', has: p => p.dossier.hasBrief },
    { key: 'photo', label: 'Photo', has: p => p.dossier.hasPhoto },
    { key: 'facts', label: 'Facts', has: p => p.factsCount > 0 },
    { key: 'clip', label: "Santa's clip", has: p => p.nameClips > 0 || p.dossier.hasAudio },
];
const score = p => PARTS.filter(part => part.has(p)).length;
const yes = (value, label) => value
    ? html`<i class="bi bi-check-circle-fill status-pass" role="img" aria-label="${label} present"></i>`
    : html`<i class="bi bi-circle status-todo" role="img" aria-label="${label} missing"></i>`;

export async function render(view, { query }) {
    const participants = await api('/participants');
    const total = participants.length;

    mount(view, html`
        ${pageHead({
            title: 'Dossiers',
            help: "Shown to each person's Santa when the mission opens",
        })}
        <div class="tiles">${PARTS.map(part => {
            const count = participants.filter(part.has).length;
            return html`<div class="tile"><div class="tile-label">${part.label}</div><div class="tile-value">${count} <small>of ${total}</small></div>${meter(count, total)}</div>`;
        })}</div>
        <section class="card" id="tableCard"></section>`);

    dataTable($('#tableCard', view), {
        rows: participants,
        rowKey: p => p.id,
        noun: 'dossier',
        searchFields: p => [p.name, p.dossier.codename],
        searchPlaceholder: 'Search name or codename',
        filters: [
            { key: 'all', label: 'All' },
            { key: 'incomplete', label: 'Incomplete', test: p => score(p) < PARTS.length },
            { key: 'no-photo', label: 'No photo', test: p => !p.dossier.hasPhoto },
            { key: 'no-clip', label: "No Santa clip", test: p => !(p.nameClips > 0 || p.dossier.hasAudio) },
        ],
        initialFilter: query.get('filter') || 'all',
        onChange: state => setQuery({ filter: state.filter === 'all' ? null : state.filter }),
        sort: { key: 'progress', dir: 'asc' },
        onRowClick: p => navigate(`/admin/participants/${p.id}#dossier`),
        columns: [
            { key: 'name', label: 'Recipient', render: p => html`<a class="primary-cell" href="/admin/participants/${p.id}#dossier">${p.name}</a>` },
            { key: 'photo', label: 'Photo', sortValue: p => (p.dossier.hasPhoto ? 1 : 0), render: p => p.dossier.hasPhoto ? html`<img class="thumb" loading="lazy" src="/api/admin/participants/${p.id}/dossier/photo" alt="">` : yes(false, 'Photo') },
            { key: 'codename', label: 'Codename', sortValue: p => p.dossier.codename || null, render: p => p.dossier.codename || html`<span class="muted">Missing</span>` },
            { key: 'brief', label: 'Brief', sortValue: p => (p.dossier.hasBrief ? 1 : 0), render: p => yes(p.dossier.hasBrief, 'Mission brief') },
            { key: 'facts', label: 'Facts', align: 'right', sortValue: p => p.factsCount, render: p => html`<span class="num ${p.factsCount ? '' : 'muted'}">${p.factsCount}</span>` },
            {
                key: 'clip', label: "Santa's clip", sortValue: p => p.nameClips + (p.dossier.hasAudio ? 0.5 : 0),
                render: p => p.nameClips ? html`<span class="badge badge-good">${p.nameClips} generated</span>` : p.dossier.hasAudio ? html`<span class="badge">Uploaded</span>` : html`<span class="badge badge-warn">Missing</span>`,
            },
            {
                key: 'progress', label: 'Complete', sortValue: score,
                render: p => html`<div style="min-width:90px"><span class="num">${score(p)} / ${PARTS.length}</span>${meter(score(p), PARTS.length)}</div>`,
            },
        ],
    });
}
