import { api, me } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, formDialog, confirmDialog, toast, info } from '../lib/ui.js';
import { dataTable } from '../lib/table.js';
import { fmtDate } from '../lib/format.js';
import { switchGroup } from '../lib/group.js';

/** Super admin only: the groups (each with its own participants, draw and settings) and who runs them. */
export async function render(view) {
    let groups = await api('/groups');
    const current = (await me()).group;

    mount(view, html`
        ${pageHead({
            title: 'Groups',
            help: 'Each group has its own participants, families, draw, dossiers, settings and maze leaderboard. Santa audio and agency facts are shared by all groups.',
            actions: html`<button class="btn btn-primary" id="addGroup"><i class="bi bi-plus-lg"></i>New group</button>`,
        })}
        <div class="callout"><i class="bi bi-info-circle"></i><span>A group's admins are its participants with admin access ${info('Mark someone as admin on their participant page. They sign in to /admin with Google and see only the groups they are admin of.', { align: 'left' })}. Open a group to manage it.</span></div>
        <section class="card" id="tableCard"></section>`);

    const table = dataTable($('#tableCard', view), {
        rows: groups,
        rowKey: g => g.id,
        noun: 'group', nounPlural: 'groups',
        searchFields: g => [g.name, ...g.admins.map(a => a.name), ...g.admins.map(a => a.email || '')],
        searchPlaceholder: 'Search groups or admins',
        sort: { key: 'name', dir: 'asc' },
        emptyIcon: 'collection',
        emptyText: 'No groups yet',
        columns: [
            {
                key: 'name', label: 'Group',
                render: g => html`<span class="primary-cell">${g.name}</span>${g.enabled ? '' : html` <span class="badge badge-warn" title="Hidden from the participants' group selection (Settings of the group)"><i class="bi bi-eye-slash"></i>Disabled</span>`}${g.id === current.id ? html` <span class="badge badge-good">Open now</span>` : ''}`,
            },
            { key: 'participants', label: 'Participants', align: 'right', render: g => html`<span class="num">${g.participants}</span>` },
            { key: 'drawn', label: 'Draw', render: g => g.drawn ? html`<span class="badge badge-good">Drawn</span>` : html`<span class="badge">Not drawn</span>` },
            {
                key: 'admins', label: 'Admins', sortable: false,
                render: g => g.admins.length
                    ? html`<span class="pill-list">${g.admins.map(a => html`<span class="badge" title="${a.email || ''}">${a.name}</span>`)}</span>`
                    : html`<span class="muted">Nobody yet</span>`,
            },
            { key: 'createdAt', label: 'Created', render: g => html`<span class="muted">${fmtDate(g.createdAt)}</span>` },
            {
                key: 'actions', label: '', sortable: false, className: 'actions',
                render: g => html`<button class="btn btn-sm" data-open="${g.id}">Open</button><button class="icon-button" data-edit="${g.id}" aria-label="Rename ${g.name}" title="Rename"><i class="bi bi-pencil"></i></button><button class="icon-button danger" data-delete="${g.id}" aria-label="Delete ${g.name}" title="Delete"><i class="bi bi-trash3"></i></button>`,
            },
        ],
    });

    const reload = async () => {
        groups = await api('/groups');
        table.setRows(groups);
    };

    $('#addGroup', view).addEventListener('click', async () => {
        const created = await formDialog({
            title: 'New group',
            submitLabel: 'Create group',
            body: html`
                <div class="field">
                    <label for="group-name">Group name</label>
                    <input type="text" id="group-name" name="name" required maxlength="100" autocomplete="off" placeholder="e.g. Office 2026">
                </div>
                <div class="field" style="margin-top:14px">
                    <span class="label">First admin (optional) ${info('Added to the group as a participant with admin access. They can then sign in to /admin with this Google account and add everyone else.', { align: 'left' })}</span>
                    <div class="field"><label for="group-admin-name">Name</label><input type="text" id="group-admin-name" name="adminName" maxlength="100" autocomplete="off"></div>
                    <div class="field"><label for="group-admin-email">Google e-mail</label><input type="email" id="group-admin-email" name="adminEmail" maxlength="200" autocomplete="off"></div>
                </div>`,
            onSubmit: form => {
                const data = new FormData(form);
                return api('/groups', {
                    method: 'POST',
                    body: {
                        name: String(data.get('name') || '').trim(),
                        adminName: String(data.get('adminName') || '').trim(),
                        adminEmail: String(data.get('adminEmail') || '').trim(),
                    },
                });
            },
        });
        if (created) {
            toast(`Created ${created.name}`, 'info', { action: { label: 'Open it', onClick: () => switchGroup(created.id, '/admin') } });
            await reload();
        }
    });

    on(view, 'click', '[data-open]', (e, button) => switchGroup(Number(button.dataset.open), '/admin'));

    on(view, 'click', '[data-edit]', async (e, button) => {
        const group = table.findRow(button.dataset.edit);
        const saved = await formDialog({
            title: `Rename ${group.name}`,
            submitLabel: 'Save',
            body: html`<div class="field"><label for="group-rename">Group name</label><input type="text" id="group-rename" name="name" required maxlength="100" value="${group.name}" autocomplete="off"></div>`,
            onSubmit: form => api(`/groups/${group.id}`, { method: 'PATCH', body: { name: String(new FormData(form).get('name') || '').trim() } }),
        });
        if (saved) {
            toast(`Renamed to ${saved.name}`);
            // The sidebar shows the group's name too.
            if (group.id === current.id) location.reload();
            else await reload();
        }
    });

    on(view, 'click', '[data-delete]', async (e, button) => {
        const group = table.findRow(button.dataset.delete);
        if (group.participants > 0) {
            toast(`${group.name} still has ${group.participants} participants. Open it and remove them first.`, 'error');
            return;
        }
        const ok = await confirmDialog({
            title: `Delete ${group.name}?`,
            message: 'The group has no participants. Its families and settings are deleted too.',
            confirmLabel: 'Delete group',
            danger: true,
        });
        if (!ok) return;
        try {
            await api(`/groups/${group.id}`, { method: 'DELETE' });
            if (group.id === current.id) {
                location.assign('/admin/groups');
                return;
            }
            toast(`Deleted ${group.name}`);
            await reload();
        } catch (err) {
            toast(err.message, 'error');
        }
    });
}
