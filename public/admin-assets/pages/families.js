import { api } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, formDialog, confirmDialog, toast, info } from '../lib/ui.js';
import { dataTable } from '../lib/table.js';

export async function render(view) {
    let [families, participants] = await Promise.all([api('/families'), api('/participants')]);

    const memberPicker = family => html`
        <div class="field">
            <label for="fam-name">Family name</label>
            <input type="text" id="fam-name" name="name" required maxlength="100" value="${family?.name ?? ''}" autocomplete="off">
        </div>
        <div class="field" style="margin-top:14px">
            <span class="label">Members ${info('Ticking someone from another family moves them here', { align: 'left' })}</span>
            <div class="member-picker">${participants.map(p => html`
                <label>
                    <input type="checkbox" name="memberIds" value="${p.id}" ${family && p.familyId === family.id ? 'checked' : ''}>
                    <span class="grow">${p.name}</span>
                    ${p.familyId && p.familyId !== family?.id ? html`<span class="muted">${p.familyName}</span>` : ''}
                </label>`)}
            </div>
        </div>`;
    const readForm = form => ({
        name: String(new FormData(form).get('name') || '').trim(),
        memberIds: new FormData(form).getAll('memberIds').map(Number),
    });

    const reload = async () => {
        [families, participants] = await Promise.all([api('/families'), api('/participants')]);
        renderWarnings();
        table.setRows(families);
    };

    mount(view, html`
        ${pageHead({
            title: 'Families',
            help: 'People in the same family are never drawn to give to each other',
            actions: html`<button class="btn btn-primary" id="addFamily"><i class="bi bi-plus-lg"></i>New family</button>`,
        })}
        <div id="warnings"></div>
        <section class="card" id="tableCard"></section>`);

    const renderWarnings = () => {
        const total = participants.length;
        const tooBig = families.filter(f => f.members.length > total - f.members.length);
        const loose = participants.filter(p => !p.familyId);
        mount($('#warnings', view), html`
            ${tooBig.map(f => html`<div class="callout callout-danger"><i class="bi bi-exclamation-octagon"></i><span><strong>${f.name}</strong> is ${f.members.length} of ${total} participants, so no draw is possible ${info('A family can be at most half of the group')}</span></div>`)}
            ${loose.length ? html`<div class="callout"><i class="bi bi-info-circle"></i><span>Without a family: ${loose.map((p, i) => html`${i ? ', ' : ''}<a href="/admin/participants/${p.id}">${p.name}</a>`)}</span></div>` : ''}`);
    };
    renderWarnings();

    const table = dataTable($('#tableCard', view), {
        rows: families,
        rowKey: f => f.id,
        noun: 'family', nounPlural: 'families',
        searchFields: f => [f.name, ...f.members.map(m => m.name)],
        searchPlaceholder: 'Search families or members',
        sort: { key: 'name', dir: 'asc' },
        emptyIcon: 'house-heart',
        emptyText: 'No families yet',
        onRowClick: f => edit(f),
        columns: [
            { key: 'name', label: 'Family', render: f => html`<span class="primary-cell">${f.name}</span>` },
            { key: 'size', label: 'Members', align: 'right', sortValue: f => f.members.length, render: f => html`<span class="num">${f.members.length}</span>` },
            {
                key: 'members', label: 'Who', sortable: false,
                render: f => f.members.length ? html`<span class="pill-list">${f.members.map(m => html`<a class="badge" href="/admin/participants/${m.id}">${m.name}</a>`)}</span>` : html`<span class="muted">No members</span>`,
            },
            {
                key: 'actions', label: '', sortable: false, className: 'actions',
                render: f => html`<button class="icon-button" data-edit="${f.id}" aria-label="Edit ${f.name}" title="Edit"><i class="bi bi-pencil"></i></button><button class="icon-button danger" data-delete="${f.id}" aria-label="Delete ${f.name}" title="Delete"><i class="bi bi-trash3"></i></button>`,
            },
        ],
    });

    const edit = async family => {
        const saved = await formDialog({
            title: family ? `Edit ${family.name}` : 'New family',
            submitLabel: family ? 'Save family' : 'Create family',
            body: memberPicker(family),
            onSubmit: async form => {
                const data = readForm(form);
                if (!family) return api('/families', { method: 'POST', body: data });
                await api(`/families/${family.id}`, { method: 'PATCH', body: { name: data.name } });
                return api(`/families/${family.id}/members`, { method: 'PUT', body: { memberIds: data.memberIds } });
            },
        });
        if (saved) {
            toast(`Saved ${saved.name}`);
            await reload();
        }
    };

    $('#addFamily', view).addEventListener('click', () => edit(null));
    on(view, 'click', '[data-edit]', (e, button) => edit(table.findRow(button.dataset.edit)));
    on(view, 'click', '[data-delete]', async (e, button) => {
        const family = table.findRow(button.dataset.delete);
        const ok = await confirmDialog({
            title: `Delete ${family.name}?`,
            message: family.members.length ? `Its ${family.members.length} members stay as participants without a family.` : 'The family has no members.',
            confirmLabel: 'Delete family',
            danger: true,
        });
        if (!ok) return;
        try {
            await api(`/families/${family.id}`, { method: 'DELETE' });
            toast(`Deleted ${family.name}`);
            await reload();
        } catch (err) {
            toast(err.message, 'error');
        }
    });
}
