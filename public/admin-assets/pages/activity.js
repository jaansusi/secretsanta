import { api, me } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, emptyState, selectOptions } from '../lib/ui.js';
import { fmtDateTime, relTime } from '../lib/format.js';
import { setQuery } from '../lib/router.js';

const PAGE_SIZE = 50;
const AREAS = [
    { value: 'participant', label: 'Participants & dossiers' },
    { value: 'family', label: 'Families' },
    { value: 'settings', label: 'Settings' },
];

export async function render(view, { query }) {
    const { eventTypes } = await me();
    const participants = await api('/participants');
    const state = {
        tab: query.get('tab') === 'events' ? 'events' : 'audit',
        offset: 0,
        type: query.get('type') || '',
        userId: query.get('userId') || '',
        entityType: query.get('entityType') || '',
    };

    mount(view, html`
        ${pageHead({ title: 'Activity log' })}
        <div class="tabs" role="tablist">
            <button role="tab" data-tab="audit">Admin changes</button>
            <button role="tab" data-tab="events">Site events</button>
        </div>
        <section class="card"><div class="toolbar" id="filters"></div><div id="results"></div></section>`);

    const renderFilters = () => {
        view.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('active', b.dataset.tab === state.tab); b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)); });
        mount($('#filters', view), state.tab === 'audit'
            ? html`<select id="entityType" style="width:auto" aria-label="Area">${selectOptions(AREAS, state.entityType, { empty: 'All areas' })}</select>`
            : html`
                <select id="eventType" style="width:auto" aria-label="Event">${selectOptions(Object.entries(eventTypes).map(([value, label]) => ({ value, label })), state.type, { empty: 'All events' })}</select>
                <select id="userFilter" style="width:auto" aria-label="Participant">${selectOptions(participants.map(p => ({ value: p.id, label: p.name })), state.userId, { empty: 'Everyone' })}</select>`);
    };

    const load = async () => {
        setQuery({ tab: state.tab === 'events' ? 'events' : null, type: state.tab === 'events' ? state.type : null, userId: state.tab === 'events' ? state.userId : null, entityType: state.tab === 'audit' ? state.entityType : null });
        const results = $('#results', view);
        results.style.opacity = '0.55';
        const params = new URLSearchParams({ limit: PAGE_SIZE, offset: state.offset });
        if (state.tab === 'events') {
            if (state.type) params.set('type', state.type);
            if (state.userId) params.set('userId', state.userId);
        } else if (state.entityType) {
            params.set('entityType', state.entityType);
        }
        const { items, total } = await api(`/${state.tab === 'events' ? 'events' : 'audit'}?${params}`);
        results.style.opacity = '1';
        const table = state.tab === 'audit'
            ? html`<table class="table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Action</th></tr></thead><tbody>
                ${items.map(item => html`<tr>
                    <td class="nowrap" title="${fmtDateTime(item.createdAt)}">${relTime(item.createdAt)}</td>
                    <td class="nowrap">${item.actorName}</td>
                    <td>${item.entityType === 'participant' && item.entityId ? html`<a href="/admin/participants/${item.entityId}">${item.summary}</a>` : item.summary}</td>
                    <td><code>${item.action}</code></td>
                </tr>`)}</tbody></table>`
            : html`<table class="table"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Device</th></tr></thead><tbody>
                ${items.map(item => html`<tr>
                    <td class="nowrap" title="${fmtDateTime(item.createdAt)}">${relTime(item.createdAt)}</td>
                    <td class="nowrap">${item.userName ? html`<a href="/admin/participants/${item.userId}">${item.userName}</a>` : html`<span class="muted">Anonymous</span>`}</td>
                    <td>${eventTypes[item.type] || item.type}${item.meta?.message ? html`<div class="sub-cell">${item.meta.message}</div>` : ''}</td>
                    <td class="sub-cell">${[item.device, item.browser, item.os].filter(Boolean).join(' · ')}</td>
                </tr>`)}</tbody></table>`;
        mount(results, items.length ? html`
            <div class="table-wrap">${table}</div>
            <div class="pager">
                <span class="count">${state.offset + 1}–${state.offset + items.length} of ${total}</span>
                <span><button class="btn btn-sm" data-page="-1" ${state.offset === 0 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i>Newer</button>
                <button class="btn btn-sm" data-page="1" ${state.offset + items.length >= total ? 'disabled' : ''}>Older<i class="bi bi-chevron-right"></i></button></span>
            </div>` : emptyState(state.tab === 'audit' ? 'journal' : 'broadcast', 'Nothing yet'));
    };

    on(view, 'click', '[data-tab]', (e, button) => { state.tab = button.dataset.tab; state.offset = 0; renderFilters(); load(); });
    on(view, 'click', '[data-page]', (e, button) => { state.offset = Math.max(0, state.offset + Number(button.dataset.page) * PAGE_SIZE); load(); });
    on(view, 'change', '#entityType', (e, select) => { state.entityType = select.value; state.offset = 0; load(); });
    on(view, 'change', '#eventType', (e, select) => { state.type = select.value; state.offset = 0; load(); });
    on(view, 'change', '#userFilter', (e, select) => { state.userId = select.value; state.offset = 0; load(); });

    renderFilters();
    await load();
}
