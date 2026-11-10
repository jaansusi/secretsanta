import { api, me } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, downloadCsv, emptyState, info } from '../lib/ui.js';
import { fmtDateTime, fmtNumber, isoDay, pct, relTime } from '../lib/format.js';
import { lineChart, columnChart, barList } from '../lib/charts.js';
import { dataTable } from '../lib/table.js';
import { setQuery } from '../lib/router.js';
import { dayLabel } from './shared.js';

const PRESETS = [
    { key: '7', label: 'Last 7 days', days: 7 },
    { key: '30', label: 'Last 30 days', days: 30 },
    { key: '90', label: 'Last 90 days', days: 90 },
    { key: '365', label: 'Last 12 months', days: 365 },
];
const ISSUE_TYPES = ['link_invalid', 'reveal_error', 'reveal_closed', 'login_failed', 'autoplay_blocked'];

function rangeFor(key) {
    const preset = PRESETS.find(p => p.key === key) || PRESETS[1];
    const to = new Date();
    const from = new Date(to.getTime() - (preset.days - 1) * 86400000);
    return { from: isoDay(from), to: isoDay(to) };
}

export async function render(view, { query }) {
    const { eventTypes } = await me();
    const state = {
        preset: query.get('from') ? 'custom' : (query.get('range') || '30'),
        ...(query.get('from') ? { from: query.get('from'), to: query.get('to') || isoDay() } : rangeFor(query.get('range') || '30')),
        excludeAdmins: query.get('admins') === 'exclude',
    };
    let cleanups = [];

    mount(view, html`
        ${pageHead({
            title: 'Analytics',
            help: 'No IP addresses are stored. Anonymous visitors are counted with a first-party cookie.',
            actions: html`<button class="btn" id="exportCsv"><i class="bi bi-download"></i>Export participants</button>`,
        })}
        <div class="toolbar card" style="margin-bottom:16px">
            <div class="segmented" role="group" aria-label="Date range">
                ${PRESETS.map(p => html`<button type="button" data-preset="${p.key}">${p.label}</button>`)}
                <button type="button" data-preset="custom">Custom</button>
            </div>
            <span id="customRange" class="${state.preset === 'custom' ? '' : 'hidden'}" style="display:inline-flex;gap:6px;align-items:center">
                <input type="date" id="fromDate" value="${state.from}" style="width:auto" aria-label="From"> – <input type="date" id="toDate" value="${state.to}" style="width:auto" aria-label="To">
            </span>
            <span class="spacer"></span>
            <label class="switch"><input type="checkbox" id="excludeAdmins" ${state.excludeAdmins ? 'checked' : ''}><span class="track"></span>Exclude admins</label>
        </div>
        <div id="report"><div class="loading">Loading…</div></div>`);

    const syncControls = () => {
        view.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === state.preset));
        $('#customRange', view).classList.toggle('hidden', state.preset !== 'custom');
        $('#fromDate', view).value = state.from;
        $('#toDate', view).value = state.to;
        setQuery({
            range: state.preset !== 'custom' && state.preset !== '30' ? state.preset : null,
            from: state.preset === 'custom' ? state.from : null,
            to: state.preset === 'custom' ? state.to : null,
            admins: state.excludeAdmins ? 'exclude' : null,
        });
    };

    let report = null;
    const load = async () => {
        syncControls();
        const container = $('#report', view);
        container.style.opacity = report ? '0.55' : '1';
        try {
            report = await api(`/analytics?from=${state.from}&to=${state.to}&excludeAdmins=${state.excludeAdmins}`);
            draw();
        } catch (err) {
            mount(container, html`<div class="callout callout-danger"><i class="bi bi-exclamation-octagon"></i>${err.message}</div>`);
        } finally {
            container.style.opacity = '1';
        }
    };

    const draw = () => {
        cleanups.forEach(fn => fn());
        cleanups = [];
        const t = report.totals;
        const count = type => report.byType.find(row => row.type === type)?.count ?? 0;
        const issues = ISSUE_TYPES.map(type => ({ type, count: count(type) })).filter(issue => issue.count > 0);
        const funnel = [
            { label: 'Participants', value: t.participants },
            { label: 'Visited the site', value: t.participantsVisited },
            { label: 'Opened their mission', value: t.participantsRevealed },
            { label: 'Heard Santa to the end', value: t.participantsHeardSanta },
        ];
        mount($('#report', view), html`
            <div class="tiles">
                <div class="tile"><div class="tile-label">Unique visitors</div><div class="tile-value">${fmtNumber(t.visitors)}</div><div class="tile-sub">${fmtNumber(t.visits)} visits</div></div>
                <div class="tile"><div class="tile-label">Participants who visited</div><div class="tile-value">${t.participantsVisited} <small>of ${t.participants}</small></div><div class="tile-sub">${pct(t.participantsVisited, t.participants)}%</div></div>
                <div class="tile"><div class="tile-label">Opened their mission</div><div class="tile-value">${t.participantsRevealed} <small>of ${t.participants}</small></div><div class="tile-sub">${fmtNumber(count('reveal'))} opens in total</div></div>
                <div class="tile"><div class="tile-label">Heard Santa to the end</div><div class="tile-value">${t.participantsHeardSanta} <small>of ${t.participants}</small></div><div class="tile-sub">${fmtNumber(count('briefing_replay'))} replays</div></div>
                <div class="tile"><div class="tile-label">Problems${info('Invalid links, errors, closed-mission attempts, failed sign-ins and blocked audio', { align: 'right' })}</div><div class="tile-value">${fmtNumber(issues.reduce((sum, i) => sum + i.count, 0))}</div></div>
            </div>

            <section class="card">
                <div class="card-head"><h2>Daily activity ${info(`Unique visitors and missions opened per day, ${report.range.timeZone} time`, { align: 'left' })}</h2></div>
                <div class="card-body">
                    <div id="dailyChart"></div>
                    <details class="table-view"><summary>Show as table</summary><div class="table-wrap"><table class="table">
                        <thead><tr><th>Day</th><th class="right">Visitors</th><th class="right">Missions opened</th></tr></thead>
                        <tbody>${report.daily.slice().reverse().map(d => html`<tr><td>${dayLabel(d.day, true)}</td><td class="right num">${d.visitors}</td><td class="right num">${d.reveals}</td></tr>`)}</tbody>
                    </table></div></details>
                </div>
            </section>

            <div class="grid-2" style="margin-top:16px">
                <section class="card"><div class="card-head"><h2>Mission funnel</h2></div>
                    <div class="card-body" id="funnel"></div></section>
                <section class="card"><div class="card-head"><h2>Time of day ${info(`Visits by hour, ${report.range.timeZone} time`, { align: 'left' })}</h2></div>
                    <div class="card-body" id="hourly"></div></section>
                <section class="card"><div class="card-head"><h2>Devices</h2></div>
                    <div class="card-body" id="devices"></div></section>
                <section class="card"><div class="card-head"><h2>Browsers ${info('In-app browsers (Facebook, Instagram) cannot use Google sign-in', { align: 'left' })}</h2></div>
                    <div class="card-body" id="browsers"></div></section>
            </div>

            ${issues.length ? html`<section class="card" style="margin-top:16px"><div class="card-head"><h2>Problems</h2><a class="btn btn-sm btn-ghost" href="/admin/activity?tab=events">See events<i class="bi bi-chevron-right"></i></a></div>
                <ul class="list">${issues.map(issue => html`<li><i class="bi bi-exclamation-triangle status-warn"></i><div class="grow">${eventTypes[issue.type]}</div><span class="num">${issue.count}</span></li>`)}</ul></section>` : ''}

            <section class="card" style="margin-top:16px">
                <div class="card-head"><h2>All events</h2></div>
                ${report.byType.length ? html`<div class="table-wrap"><table class="table">
                    <thead><tr><th>Event</th><th class="right">Count</th><th class="right">Participants</th></tr></thead>
                    <tbody>${report.byType.slice().sort((a, b) => b.count - a.count).map(row => html`<tr>
                        <td><a href="/admin/activity?tab=events&type=${row.type}">${eventTypes[row.type] || row.type}</a></td><td class="right num">${fmtNumber(row.count)}</td><td class="right num">${fmtNumber(row.users)}</td></tr>`)}</tbody>
                </table></div>` : emptyState('graph-up', 'No events')}
            </section>

            <div class="section-title"><h2>Participants</h2></div>
            <section class="card" id="participantTable"></section>`);

        cleanups.push(lineChart($('#dailyChart', view), {
            labels: report.daily.map(d => d.day),
            series: [
                { name: 'Visitors', color: 'var(--series-1)', values: report.daily.map(d => d.visitors) },
                { name: 'Missions opened', color: 'var(--series-2)', values: report.daily.map(d => d.reveals) },
            ],
            formatLabel: (day, long) => dayLabel(day, long),
        }));
        barList($('#funnel', view), funnel.map((step, i) => ({ ...step, note: i ? `${pct(step.value, t.participants)}%` : '' })), { max: t.participants || 1, emptyText: 'No participants.' });
        cleanups.push(columnChart($('#hourly', view), {
            labels: report.hourly.map(h => h.hour),
            values: report.hourly.map(h => h.count),
            valueLabel: 'visits',
            formatLabel: (hour, long) => long ? `${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59` : String(hour).padStart(2, '0'),
        }));
        const visitorTotal = report.devices.reduce((sum, d) => sum + d.count, 0);
        barList($('#devices', view), report.devices.map(d => ({ label: d.name ? d.name.charAt(0).toUpperCase() + d.name.slice(1) : 'Unknown', value: d.count, note: `${pct(d.count, visitorTotal)}%` })));
        barList($('#browsers', view), report.browsers.map(b => ({ label: b.name || 'Unknown', value: b.count, note: `${pct(b.count, visitorTotal)}%` })));

        dataTable($('#participantTable', view), {
            rows: report.participants,
            rowKey: p => p.userId,
            noun: 'participant',
            searchFields: p => [p.name],
            searchPlaceholder: 'Search participants',
            filters: [
                { key: 'all', label: 'All' },
                { key: 'never', label: 'Never visited', test: p => !p.lastSeen },
                { key: 'not-opened', label: 'Not opened', test: p => !p.reveals },
            ],
            sort: { key: 'lastSeen', dir: 'desc' },
            columns: [
                { key: 'name', label: 'Participant', render: p => html`<a class="primary-cell" href="/admin/participants/${p.userId}">${p.name}</a>` },
                { key: 'visits', label: 'Visits', align: 'right', defaultDir: 'desc', render: p => html`<span class="num">${p.visits}</span>` },
                { key: 'reveals', label: 'Missions opened', align: 'right', defaultDir: 'desc', render: p => html`<span class="num">${p.reveals}</span>` },
                { key: 'firstReveal', label: 'First opened', sortValue: p => p.firstReveal ? new Date(p.firstReveal).getTime() : null, render: p => p.firstReveal ? fmtDateTime(p.firstReveal) : html`<span class="muted">Not yet</span>` },
                { key: 'heardSanta', label: 'Heard Santa', sortValue: p => (p.heardSanta ? 1 : 0), render: p => p.heardSanta ? html`<i class="bi bi-check-circle-fill status-pass" aria-label="Yes"></i>` : html`<span class="muted">No</span>` },
                { key: 'device', label: 'Device', render: p => p.device ?? html`<span class="muted">–</span>` },
                { key: 'lastSeen', label: 'Last seen', defaultDir: 'desc', sortValue: p => p.lastSeen ? new Date(p.lastSeen).getTime() : null, render: p => p.lastSeen ? html`<span title="${fmtDateTime(p.lastSeen)}">${relTime(p.lastSeen)}</span>` : html`<span class="muted">Never</span>` },
            ],
        });
    };

    on(view, 'click', '[data-preset]', (e, button) => {
        state.preset = button.dataset.preset;
        if (state.preset !== 'custom') Object.assign(state, rangeFor(state.preset));
        load();
    });
    on(view, 'change', '#fromDate, #toDate', () => {
        const from = $('#fromDate', view).value, to = $('#toDate', view).value;
        if (from && to && from <= to) { state.from = from; state.to = to; load(); }
    });
    on(view, 'change', '#excludeAdmins', (e, input) => { state.excludeAdmins = input.checked; load(); });
    $('#exportCsv', view).addEventListener('click', () => report && downloadCsv(`participant-activity-${state.from}-to-${state.to}.csv`, [
        { label: 'Participant', value: p => p.name },
        { label: 'Visits', value: p => p.visits },
        { label: 'Missions opened', value: p => p.reveals },
        { label: 'First opened', value: p => p.firstReveal ?? '' },
        { label: 'Heard Santa', value: p => (p.heardSanta ? 'yes' : 'no') },
        { label: 'Device', value: p => p.device ?? '' },
        { label: 'Last seen', value: p => p.lastSeen ?? '' },
    ], report.participants));

    await load();
    return () => cleanups.forEach(fn => fn());
}
