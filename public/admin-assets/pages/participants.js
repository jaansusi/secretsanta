import { api } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, formDialog, confirmDialog, toast, toastWarnings, downloadCsv } from '../lib/ui.js';
import { dataTable } from '../lib/table.js';
import { fmtDateTime, relTime } from '../lib/format.js';
import { navigate, setQuery } from '../lib/router.js';
import { missionBadge } from './shared.js';
import { profileFields, readProfile } from './participant-form.js';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'not-opened', label: 'Not opened', test: p => p.hasAssignment && !p.activity?.firstReveal },
    { key: 'incomplete', label: 'Dossier incomplete', test: p => !(p.dossier.codename && p.dossier.hasBrief && p.dossier.hasPhoto) },
    { key: 'no-email', label: 'No e-mail', test: p => !p.email },
    { key: 'no-family', label: 'No family', test: p => !p.familyId },
    { key: 'admins', label: 'Admins', test: p => p.isAdmin },
];

function dossierFlags(p) {
    const flags = [
        ['person-badge', !!p.dossier.codename, 'Codename'],
        ['card-text', p.dossier.hasBrief, 'Mission brief'],
        ['image', p.dossier.hasPhoto, 'Photo'],
        ['list-ul', p.factsCount > 0, `${p.factsCount} facts`],
        ['soundwave', p.nameClips > 0 || p.dossier.hasAudio, p.nameClips ? `${p.nameClips} Santa name clips` : p.dossier.hasAudio ? 'Uploaded audio' : 'No Santa clip'],
    ];
    return html`<span class="flags">${flags.map(([icon, on, label]) => html`<i class="bi bi-${icon} flag ${on ? 'on' : ''}" title="${label}${on ? '' : ' missing'}" aria-label="${label}${on ? '' : ' missing'}"></i>`)}</span>`;
}

export async function render(view, { query }) {
    const [participants, families] = await Promise.all([api('/participants'), api('/families')]);
    const drawn = participants.some(p => p.hasAssignment);

    mount(view, html`
        ${pageHead({
            title: 'Participants',
            actions: html`
                <button class="btn" id="exportCsv"><i class="bi bi-download"></i>Export CSV</button>
                <button class="btn btn-primary" id="addParticipant"><i class="bi bi-person-plus"></i>Add participant</button>`,
        })}
        <section class="card" id="tableCard"></section>`);

    const table = dataTable($('#tableCard', view), {
        rows: participants,
        rowKey: p => p.id,
        noun: 'participant',
        searchFields: p => [p.name, p.email, p.familyName, p.dossier.codename],
        searchPlaceholder: 'Search name, e-mail, family',
        initialSearch: query.get('q') || '',
        filters: FILTERS,
        initialFilter: FILTERS.some(f => f.key === query.get('filter')) ? query.get('filter') : 'all',
        sort: { key: 'name', dir: 'asc' },
        emptyIcon: 'people',
        emptyText: 'No participants yet',
        onRowClick: p => navigate(`/admin/participants/${p.id}`),
        onChange: state => setQuery({ filter: state.filter === 'all' ? null : state.filter, q: state.search || null }),
        columns: [
            {
                key: 'name', label: 'Name',
                render: p => html`<a class="primary-cell" href="/admin/participants/${p.id}">${p.name}</a>
                    ${p.isAdmin ? html` <span class="badge badge-accent">Admin</span>` : ''}
                    ${p.dossier.codename ? html`<div class="sub-cell">“${p.dossier.codename}”</div>` : ''}`,
            },
            { key: 'email', label: 'E-mail', render: p => p.email ? p.email : html`<span class="muted">Missing</span>` },
            { key: 'familyName', label: 'Family', render: p => p.familyName ?? html`<span class="muted">None</span>` },
            { key: 'lastYearGiftingToName', label: 'Gave to last year', render: p => p.lastYearGiftingToName ?? html`<span class="muted">Unknown</span>` },
            {
                key: 'dossier', label: 'Dossier', render: dossierFlags,
                sortValue: p => [p.dossier.codename, p.dossier.hasBrief, p.dossier.hasPhoto, p.factsCount > 0, p.nameClips > 0 || p.dossier.hasAudio].filter(Boolean).length,
                defaultDir: 'desc',
            },
            {
                key: 'mission', label: 'Mission', render: p => missionBadge(p, drawn),
                sortValue: p => !p.hasAssignment ? 0 : p.activity?.briefingComplete ? 3 : p.activity?.firstReveal ? 2 : 1,
            },
            {
                key: 'lastSeen', label: 'Last seen', defaultDir: 'desc',
                sortValue: p => p.activity?.lastSeen ? new Date(p.activity.lastSeen).getTime() : null,
                render: p => p.activity?.lastSeen ? html`<span title="${fmtDateTime(p.activity.lastSeen)}">${relTime(p.activity.lastSeen)}</span>` : html`<span class="muted">Never</span>`,
            },
            {
                key: 'actions', label: '', sortable: false, className: 'actions',
                render: p => html`<a class="icon-button" href="/admin/participants/${p.id}" title="Edit ${p.name}" aria-label="Edit ${p.name}"><i class="bi bi-pencil"></i></a><button class="icon-button danger" data-delete="${p.id}" title="Delete ${p.name}" aria-label="Delete ${p.name}"><i class="bi bi-trash3"></i></button>`,
            },
        ],
    });

    const addParticipant = async () => {
        const created = await formDialog({
            title: 'Add participant',
            submitLabel: 'Add participant',
            body: profileFields(null, { families, participants }),
            onSubmit: form => api('/participants', { method: 'POST', body: readProfile(form) }),
        });
        if (created) {
            toast(`Added ${created.participant.name}`);
            toastWarnings(created.warnings);
            navigate(`/admin/participants/${created.participant.id}`);
        }
    };

    $('#addParticipant', view).addEventListener('click', addParticipant);
    $('#exportCsv', view).addEventListener('click', () => downloadCsv('participants.csv', [
        { label: 'Name', value: p => p.name },
        { label: 'E-mail', value: p => p.email },
        { label: 'Family', value: p => p.familyName },
        { label: 'Gave to last year', value: p => p.lastYearGiftingToName },
        { label: 'Admin', value: p => (p.isAdmin ? 'yes' : 'no') },
        { label: 'Codename', value: p => p.dossier.codename },
        { label: 'Mission brief', value: p => (p.dossier.hasBrief ? 'yes' : 'no') },
        { label: 'Photo', value: p => (p.dossier.hasPhoto ? 'yes' : 'no') },
        { label: 'Facts', value: p => p.factsCount },
        { label: 'Santa name clips', value: p => p.nameClips },
        { label: 'In draw', value: p => (p.hasAssignment ? 'yes' : 'no') },
        { label: 'Opened mission', value: p => p.activity?.firstReveal ?? '' },
        { label: 'Heard Santa', value: p => (p.activity?.briefingComplete ? 'yes' : 'no') },
        { label: 'Last seen', value: p => p.activity?.lastSeen ?? '' },
    ], table.visibleRows()));

    on(view, 'click', '[data-delete]', async (event, button) => {
        const participant = table.findRow(button.dataset.delete);
        if (!participant) return;
        const ok = await confirmDialog({
            title: `Delete ${participant.name}?`,
            message: html`This removes their profile, dossier, photo and audio. ${participant.hasAssignment ? html`<strong>They are part of the current draw, so the draw must be run again.</strong>` : ''}`,
            confirmLabel: 'Delete participant',
            danger: true,
        });
        if (!ok) return;
        try {
            const result = await api(`/participants/${participant.id}`, { method: 'DELETE' });
            toast(`Deleted ${participant.name}`);
            toastWarnings(result.warnings);
            table.setRows(table.state.rows.filter(p => p.id !== participant.id));
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    if (query.get('new')) {
        setQuery({ new: null });
        addParticipant();
    }
}
