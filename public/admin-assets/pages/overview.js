import { api, me } from '../lib/api.js';
import { html, mount, $ } from '../lib/dom.js';
import { pageHead, statusIcon, meter, emptyState, info } from '../lib/ui.js';
import { daysUntil, fmtDate, relTime } from '../lib/format.js';
import { lineChart } from '../lib/charts.js';
import { auditItem, eventItem, dayLabel } from './shared.js';

const DRAW_STATE = {
    valid: html`<span class="badge badge-good"><i class="bi bi-check-circle"></i>Draw valid</span>`,
    invalid: html`<span class="badge badge-bad"><i class="bi bi-x-circle"></i>Draw has problems</span>`,
    not_drawn: html`<span class="badge">Not drawn yet</span>`,
};

export async function render(view) {
    const [data, { eventTypes }] = await Promise.all([api('/overview'), me()]);
    const days = daysUntil(data.settings.exchangeDate);
    const { reveal, content, counts } = data;

    mount(view, html`
        ${pageHead({
            title: 'Overview',
            sub: html`<span class="pill-list">${DRAW_STATE[data.draw.state]}
                ${data.settings.revealOpen ? html`<span class="badge badge-good"><i class="bi bi-unlock"></i>Missions open</span>` : html`<span class="badge badge-warn"><i class="bi bi-lock"></i>Missions closed</span>`}
                ${data.settings.giftBudget ? html`<span class="badge"><i class="bi bi-wallet2"></i>Budget ${data.settings.giftBudget}</span>` : ''}</span>`,
            actions: html`<a class="btn" href="/admin/draw"><i class="bi bi-shuffle"></i>Draw &amp; links</a><a class="btn btn-primary" href="/admin/participants?new=1"><i class="bi bi-person-plus"></i>Add participant</a>`,
        })}

        <div class="tiles">
            <div class="tile">
                <div class="tile-label">Participants</div>
                <div class="tile-value">${counts.participants}</div>
                <div class="tile-sub">${counts.families} families · ${counts.admins} admin${counts.admins === 1 ? '' : 's'}</div>
            </div>
            <div class="tile">
                <div class="tile-label">Missions opened</div>
                <div class="tile-value">${reveal.revealed} <small>of ${reveal.total}</small></div>
                ${meter(reveal.revealed, reveal.total)}
            </div>
            <div class="tile">
                <div class="tile-label">Heard Santa to the end${info('Listened to the whole audio briefing at least once', { align: 'right' })}</div>
                <div class="tile-value">${reveal.heardSanta} <small>of ${reveal.total}</small></div>
                ${meter(reveal.heardSanta, reveal.total)}
            </div>
            <div class="tile">
                <div class="tile-label">Dossiers complete${info('Codename, mission brief and photo filled in', { align: 'right' })}</div>
                <div class="tile-value">${content.complete} <small>of ${content.total}</small></div>
                ${meter(content.complete, content.total)}
            </div>
            <div class="tile">
                <div class="tile-label">Gift exchange</div>
                ${days === null
                    ? html`<div class="tile-value"><small><a href="/admin/settings">Set the date</a></small></div>`
                    : html`<div class="tile-value">${days > 0 ? days : days === 0 ? 'Today' : 'Done'} ${days > 0 ? html`<small>day${days === 1 ? '' : 's'}</small>` : ''}</div>
                           <div class="tile-sub">${fmtDate(data.settings.exchangeDate)}</div>`}
            </div>
        </div>

        <div class="grid-main-aside">
            <div class="stack">
                <section class="card">
                    <div class="card-head"><h2>Season checklist</h2>
                        <span class="count">${data.checklist.filter(item => item.status === 'done').length} of ${data.checklist.length} done</span></div>
                    <ul class="list">
                        ${data.checklist.map(item => html`<li>
                            ${statusIcon(item.status)}
                            <div class="grow"><div class="title">${item.label}</div><div class="meta">${item.detail}</div></div>
                            <a class="btn btn-sm btn-ghost" href="${item.href}">Open<i class="bi bi-chevron-right"></i></a>
                        </li>`)}
                    </ul>
                </section>
                ${data.draw.warnings.length ? html`<div class="callout callout-warn"><i class="bi bi-exclamation-triangle"></i><ul style="margin:0;padding-left:16px">${data.draw.warnings.map(w => html`<li>${w}</li>`)}</ul></div>` : ''}
                <section class="card">
                    <div class="card-head"><h2>Last 14 days</h2><a class="btn btn-sm btn-ghost" href="/admin/analytics">Analytics<i class="bi bi-chevron-right"></i></a></div>
                    <div class="card-body"><div id="dailyChart"></div></div>
                </section>
                <div class="grid-2">
                    <section class="card">
                        <div class="card-head"><h2>Site activity</h2><a class="btn btn-sm btn-ghost" href="/admin/activity?tab=events">All<i class="bi bi-chevron-right"></i></a></div>
                        ${data.recentEvents.length ? html`<ul class="list timeline">${data.recentEvents.map(event => eventItem(event, eventTypes))}</ul>` : emptyState('broadcast', 'No visits yet')}
                    </section>
                    <section class="card">
                        <div class="card-head"><h2>Admin changes</h2><a class="btn btn-sm btn-ghost" href="/admin/activity">All<i class="bi bi-chevron-right"></i></a></div>
                        ${data.recentAudit.length ? html`<ul class="list timeline">${data.recentAudit.map(auditItem)}</ul>` : emptyState('journal', 'No changes yet')}
                    </section>
                </div>
            </div>
            <aside class="stack">
                <section class="card">
                    <div class="card-head"><h2>Not opened yet</h2>${data.draw.state === 'not_drawn' ? '' : html`<span class="count">${reveal.waiting.length} of ${reveal.total}</span>`}</div>
                    ${data.draw.state === 'not_drawn'
                        ? emptyState('hourglass', 'No draw yet')
                        : reveal.waiting.length
                            ? html`<ul class="list">${reveal.waiting.map(p => html`<li>
                                <div class="grow"><a class="title" href="/admin/participants/${p.id}">${p.name}</a>
                                <div class="meta">${p.lastSeen ? `Seen ${relTime(p.lastSeen)}` : 'Not seen since the draw'}</div></div>
                              </li>`)}</ul>`
                            : emptyState('stars', 'Everyone has opened it')}
                </section>
                ${data.settings.adminNotes ? html`<section class="card">
                    <div class="card-head"><h2>Organiser notes</h2><a class="btn btn-sm btn-ghost" href="/admin/settings">Edit<i class="bi bi-chevron-right"></i></a></div>
                    <div class="card-body" style="white-space:pre-wrap">${data.settings.adminNotes}</div>
                </section>` : ''}
                <section class="card">
                    <div class="card-head"><h2>Dossiers</h2><a class="btn btn-sm btn-ghost" href="/admin/content">Edit<i class="bi bi-chevron-right"></i></a></div>
                    <div class="card-body stack" style="gap:12px">
                        ${[['Codename', content.codename], ['Mission brief', content.brief], ['Photo', content.photo], ['Facts', content.facts], ["Santa's name clip", content.nameClips]]
                            .map(([label, value]) => html`<div><div style="display:flex;justify-content:space-between"><span class="ink-2">${label}</span><span class="num">${value} / ${content.total}</span></div>${meter(value, content.total)}</div>`)}
                    </div>
                </section>
            </aside>
        </div>`);

    return lineChart($('#dailyChart', view), {
        labels: data.daily.map(d => d.day),
        series: [
            { name: 'Visitors', color: 'var(--series-1)', values: data.daily.map(d => d.visitors) },
            { name: 'Missions opened', color: 'var(--series-2)', values: data.daily.map(d => d.reveals) },
        ],
        height: 200,
        formatLabel: (day, long) => dayLabel(day, long),
    });
}
