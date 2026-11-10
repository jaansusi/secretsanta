import { api, me } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, confirmDialog, toast, toastWarnings, setDirty, copyText, emptyState, info } from '../lib/ui.js';
import { fmtBytes, fmtDateTime, relTime } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { auditItem, eventItem } from './shared.js';
import { profileFields, readProfile } from './participant-form.js';

const MAX_UPLOAD = 20 * 1024 * 1024;

export async function render(view, { params }) {
    const id = parseInt(params[0], 10);
    let [participant, families, participants, { eventTypes }] = await Promise.all([
        api(`/participants/${id}`), api('/families'), api('/participants'), me(),
    ]);
    const drawn = participants.some(p => p.hasAssignment);

    mount(view, html`
        <div id="head"></div>
        <div class="grid-main-aside">
            <div class="stack">
                <form class="card" id="profileCard" novalidate></form>
                <section class="card" id="dossier">
                    <div class="card-head"><h2>Dossier ${info("What this person's Santa sees when opening the mission", { align: 'left' })}</h2></div>
                    <form id="dossierText" novalidate></form>
                    <div class="card-body" style="border-top:1px solid var(--line)" id="dossierMedia"></div>
                </section>
            </div>
            <aside class="stack">
                <section class="card" id="statusCard"></section>
                <section class="card" id="clipsCard"></section>
                <section class="card" id="activityCard"></section>
            </aside>
        </div>`);

    // ---------- Header ----------
    const renderHead = () => mount($('#head', view), pageHead({
        crumbs: html`<a href="/admin/participants">Participants</a> / ${participant.name}`,
        title: html`${participant.name} ${participant.isAdmin ? html`<span class="badge badge-accent">Admin</span>` : ''} ${participant.familyName ? html`<span class="badge"><i class="bi bi-house-heart"></i>${participant.familyName}</span>` : ''}`,
        sub: `Added ${fmtDateTime(participant.createdAt)} · updated ${relTime(participant.updatedAt)}`,
        actions: html`
            ${participant.hasLink ? html`<button class="btn" id="copyLink"><i class="bi bi-link-45deg"></i>Copy personal link</button>` : ''}
            <button class="btn btn-danger" id="deleteParticipant"><i class="bi bi-trash3"></i>Delete</button>`,
    }));

    // ---------- Profile ----------
    const renderProfile = () => mount($('#profileCard', view), html`
        <div class="card-head"><h2>Profile</h2></div>
        <div class="card-body">${profileFields(participant, { families, participants })}</div>
        <div class="card-foot"><button type="submit" class="btn btn-primary" disabled>Save profile</button></div>`);

    // ---------- Dossier text ----------
    const factsList = text => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const renderDossierText = () => mount($('#dossierText', view), html`
        <div class="card-body">
            <div class="form-grid">
                <div class="field">
                    <label for="d-codename">Codename</label>
                    <input type="text" id="d-codename" name="codename" maxlength="100" placeholder="e.g. Operatiiv Piparkook" value="${participant.dossier.codename}">
                </div>
                <div class="field full">
                    <label for="d-brief">Mission brief</label>
                    <textarea id="d-brief" name="missionBrief" rows="4" maxlength="5000">${participant.dossier.missionBrief}</textarea>
                </div>
                <div class="field full">
                    <label for="d-facts">Known facts ${info('One per line. Shown under "Teadaolevad faktid".', { align: 'left' })}</label>
                    <textarea id="d-facts" name="facts" rows="5" maxlength="5000" placeholder="One fact per line">${participant.interestingFacts}</textarea>
                    <span class="hint" id="factsHint"></span>
                </div>
            </div>
        </div>
        <div class="card-foot"><button type="submit" class="btn btn-primary" disabled>Save dossier text</button></div>`);
    const updateFactsHint = () => {
        const count = factsList($('#d-facts', view).value).length;
        $('#factsHint', view).textContent = `${count} fact${count === 1 ? '' : 's'}`;
    };

    // ---------- Dossier media ----------
    const renderMedia = () => {
        const d = participant.dossier;
        const bust = `?t=${Date.now()}`;
        mount($('#dossierMedia', view), html`
            <div class="stack">
                <div class="field">
                    <span class="label">Photo ${info('Image up to 20 MB. Click or drop a file.', { align: 'left' })}</span>
                    <div class="media-row">
                        <div class="media-preview">${d.hasPhoto ? html`<img src="/api/admin/participants/${id}/dossier/photo${bust}" alt="Photo of ${participant.name}">` : html`<i class="bi bi-person"></i>`}</div>
                        <label class="dropzone" data-drop="photo">
                            <input type="file" accept="image/*" data-upload="photo">
                            <i class="bi bi-cloud-arrow-up"></i> ${d.hasPhoto ? 'Replace photo' : 'Upload photo'}
                        </label>
                    </div>
                    ${d.hasPhoto ? html`<div class="hint">${d.photoMimeType} · ${fmtBytes(d.photoBytes)} <button type="button" class="btn btn-sm btn-ghost btn-danger" data-remove="photo"><i class="bi bi-x-lg"></i>Remove</button></div>` : ''}
                </div>
                <div class="field">
                    <span class="label">Own audio clip ${info('Played only when this person has no generated Santa name clip. Audio up to 20 MB.', { align: 'left' })}</span>
                    ${d.hasAudio ? html`<audio controls preload="none" src="/api/admin/participants/${id}/dossier/audio${bust}"></audio>
                        <div class="hint">${d.audioMimeType} · ${fmtBytes(d.audioBytes)} <button type="button" class="btn btn-sm btn-ghost btn-danger" data-remove="audio"><i class="bi bi-x-lg"></i>Remove</button></div>` : ''}
                    <label class="dropzone" data-drop="audio">
                        <input type="file" accept="audio/*" data-upload="audio">
                        <i class="bi bi-cloud-arrow-up"></i> ${d.hasAudio ? 'Replace audio' : 'Upload audio'}
                    </label>
                </div>
            </div>`);
    };

    // ---------- Aside ----------
    const renderStatus = () => {
        const a = participant.activity;
        mount($('#statusCard', view), html`
            <div class="card-head"><h2>This season</h2></div>
            <div class="card-body">
                <dl class="kv">
                    <dt>In the draw</dt><dd>${participant.hasAssignment ? html`<span class="badge badge-good">Yes</span>` : html`<span class="badge ${drawn ? 'badge-bad' : ''}">No</span>`}</dd>
                    <dt>Opened mission</dt><dd>${a?.firstReveal ? fmtDateTime(a.firstReveal) : html`<span class="muted">Not yet</span>`}</dd>
                    <dt>Times opened</dt><dd class="num">${a?.reveals ?? 0}</dd>
                    <dt>Heard Santa</dt><dd>${a?.briefingComplete ? 'Yes' : html`<span class="muted">No</span>`}</dd>
                    <dt>Visits</dt><dd class="num">${a?.visits ?? 0}</dd>
                    <dt>Last seen</dt><dd>${a?.lastSeen ? html`<span title="${fmtDateTime(a.lastSeen)}">${relTime(a.lastSeen)}</span>` : html`<span class="muted">Never</span>`}</dd>
                    <dt>Device</dt><dd>${a?.device ?? html`<span class="muted">Unknown</span>`}</dd>
                </dl>
            </div>`);
        mount($('#clipsCard', view), html`
            <div class="card-head"><h2>Name clips</h2><a class="btn btn-sm btn-ghost" href="/admin/audio?tab=participants">Generate<i class="bi bi-chevron-right"></i></a></div>
            ${participant.nameClips.length
                ? html`<div class="card-body stack" style="gap:8px">${participant.nameClips.map((url, i) => html`<div><div class="hint">Variant ${i + 1}</div><audio controls preload="none" src="${url}"></audio></div>`)}</div>`
                : emptyState('mic-mute', participant.dossier.hasAudio ? 'None, own clip is used' : 'None')}`);
        const timeline = [
            ...participant.events.map(e => ({ at: e.createdAt, item: eventItem(e, eventTypes, { showUser: false }) })),
            ...participant.audit.map(e => ({ at: e.createdAt, item: auditItem(e) })),
        ].sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 25);
        mount($('#activityCard', view), html`
            <div class="card-head"><h2>Activity</h2><a class="btn btn-sm btn-ghost" href="/admin/activity?tab=events&userId=${id}">All<i class="bi bi-chevron-right"></i></a></div>
            ${timeline.length ? html`<ul class="list timeline">${timeline.map(t => t.item)}</ul>` : emptyState('clock', 'Nothing yet')}`);
    };

    const refreshAll = () => {
        renderHead();
        renderStatus();
        renderMedia();
    };

    renderHead();
    renderProfile();
    renderDossierText();
    updateFactsHint();
    refreshAll();

    // ---------- Behaviour ----------
    const dirtyForms = new Set();
    const markDirty = (form, value) => {
        if (value) dirtyForms.add(form.id); else dirtyForms.delete(form.id);
        form.querySelector('button[type=submit]').disabled = !value;
        setDirty(dirtyForms.size > 0);
    };
    on(view, 'input', '#profileCard', (e, form) => markDirty(form, true));
    on(view, 'input', '#dossierText', (e, form) => { markDirty(form, true); if (e.target.id === 'd-facts') updateFactsHint(); });

    $('#profileCard', view).addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type=submit]');
        button.disabled = true;
        try {
            const result = await api(`/participants/${id}`, { method: 'PATCH', body: readProfile(form) });
            participant = result.participant;
            participants = participants.map(p => (p.id === id ? { ...p, name: participant.name } : p));
            markDirty(form, false);
            renderProfile();
            refreshAll();
            toast('Profile saved');
            toastWarnings(result.warnings);
        } catch (err) {
            button.disabled = false;
            toast(err.message, 'error');
        }
    });

    $('#dossierText', view).addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        form.querySelector('button[type=submit]').disabled = true;
        try {
            participant = await api(`/participants/${id}/dossier`, {
                method: 'PUT',
                body: { codename: data.get('codename'), missionBrief: data.get('missionBrief'), facts: data.get('facts') },
            });
            markDirty(form, false);
            refreshAll();
            toast('Dossier saved');
        } catch (err) {
            form.querySelector('button[type=submit]').disabled = false;
            toast(err.message, 'error');
        }
    });

    const upload = async (kind, file) => {
        if (!file) return;
        const expected = kind === 'photo' ? 'image/' : 'audio/';
        if (!file.type.startsWith(expected)) return toast(`Choose ${kind === 'photo' ? 'an image' : 'an audio file'}.`, 'error');
        if (file.size > MAX_UPLOAD) return toast('The file is larger than 20 MB.', 'error');
        const form = new FormData();
        form.append('file', file);
        try {
            toast(`Uploading ${kind}…`);
            participant = await api(`/participants/${id}/dossier/${kind}`, { method: 'POST', form });
            refreshAll();
            toast(`${kind === 'photo' ? 'Photo' : 'Audio'} uploaded`);
        } catch (err) {
            toast(err.message, 'error');
        }
    };
    on(view, 'change', '[data-upload]', (e, input) => upload(input.dataset.upload, input.files[0]));
    on(view, 'dragover', '[data-drop]', (e, zone) => { e.preventDefault(); zone.classList.add('over'); });
    on(view, 'dragleave', '[data-drop]', (e, zone) => zone.classList.remove('over'));
    on(view, 'drop', '[data-drop]', (e, zone) => { e.preventDefault(); zone.classList.remove('over'); upload(zone.dataset.drop, e.dataTransfer.files[0]); });
    on(view, 'click', '[data-remove]', async (e, button) => {
        const kind = button.dataset.remove;
        if (!(await confirmDialog({ title: `Remove ${kind}?`, message: `The ${kind} is deleted from ${participant.name}'s dossier.`, confirmLabel: 'Remove', danger: true }))) return;
        try {
            participant = await api(`/participants/${id}/dossier/${kind}`, { method: 'DELETE' });
            refreshAll();
            toast(`${kind === 'photo' ? 'Photo' : 'Audio'} removed`);
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    on(view, 'click', '#copyLink', async () => {
        try {
            const { url } = await api(`/participants/${id}/link`);
            if (url) await copyText(url, 'Personal link copied');
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    on(view, 'click', '#deleteParticipant', async () => {
        const ok = await confirmDialog({
            title: `Delete ${participant.name}?`,
            message: html`This removes their profile, dossier, photo and audio. ${participant.hasAssignment ? html`<strong>They are part of the current draw, so the draw must be run again.</strong>` : ''}`,
            confirmLabel: 'Delete participant',
            danger: true,
        });
        if (!ok) return;
        try {
            const result = await api(`/participants/${id}`, { method: 'DELETE' });
            toast(`Deleted ${participant.name}`);
            toastWarnings(result.warnings);
            setDirty(false);
            navigate('/admin/participants');
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    if (location.hash === '#dossier') $('#dossier', view).scrollIntoView();
    return () => setDirty(false);
}
