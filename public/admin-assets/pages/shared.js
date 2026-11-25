import { html } from '../lib/dom.js';
import { fmtDateTime, relTime } from '../lib/format.js';

/** Icons for site events and admin actions in feeds. */
const EVENT_ICONS = {
    page_view: 'eye', link_open: 'link-45deg', link_invalid: 'x-octagon', login_google: 'google', login_failed: 'person-x',
    reveal: 'envelope-open', reveal_error: 'exclamation-octagon', reveal_closed: 'lock', letter_view: 'envelope-paper',
    briefing_complete: 'soundwave', briefing_replay: 'arrow-repeat', autoplay_blocked: 'volume-mute',
};
const AUDIT_ICONS = { participant: 'person', family: 'house-heart', settings: 'gear', draw: 'shuffle', dossier: 'folder2-open', data: 'box-arrow-in-down', group: 'collection' };

export function eventLabel(eventTypes, type) {
    return eventTypes?.[type] || type;
}

export function eventItem(event, eventTypes, { showUser = true } = {}) {
    return html`<li>
        <span class="dot"><i class="bi bi-${EVENT_ICONS[event.type] || 'dot'}"></i></span>
        <div class="grow">
            <div class="title">${showUser ? (event.userName
                ? html`<a href="/admin/participants/${event.userId}">${event.userName}</a> `
                : html`<span class="muted">Anonymous visitor </span>`) : ''}${lowerFirst(eventLabel(eventTypes, event.type), showUser)}</div>
            <div class="meta" title="${fmtDateTime(event.createdAt)}">${relTime(event.createdAt)} · ${[event.device, event.browser].filter(Boolean).join(', ')}</div>
        </div>
    </li>`;
}

export function auditItem(entry) {
    const area = entry.action.split('.')[0];
    return html`<li>
        <span class="dot admin"><i class="bi bi-${AUDIT_ICONS[area] || 'pencil'}"></i></span>
        <div class="grow">
            <div class="title">${auditSummary(entry)}</div>
            <div class="meta" title="${fmtDateTime(entry.createdAt)}">${relTime(entry.createdAt)} · ${entry.actorName}</div>
        </div>
    </li>`;
}

/**
 * An audit summary with its secret parts (who gives to whom, marked ||like this|| by the server) hidden
 * until clicked. Entries written before the marking existed are recognised by their wording.
 */
export function auditSummary(entry) {
    let summary = entry.summary || '';
    if (entry.action === 'draw.insert' && !summary.includes('||')) {
        summary = summary.replace(/^(Added .+? to the draw: )(.+)( now gives to them)$/, '$1||$2||$3');
    }
    return html`${summary.split('||').map((part, i) => (i % 2
        ? html`<span class="secret" role="button" tabindex="0" data-secret="${part}" title="Click to show">hidden<i class="bi bi-eye"></i></span>`
        : part))}`;
}

// Capture phase, so revealing a name inside a link (activity table) does not also follow the link.
const toggleSecret = event => {
    const chip = event.target.closest?.('.secret');
    if (!chip || (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    const shown = chip.classList.toggle('shown');
    chip.textContent = shown ? chip.dataset.secret : 'hidden';
    if (!shown) chip.insertAdjacentHTML('beforeend', '<i class="bi bi-eye"></i>');
    chip.title = shown ? 'Click to hide' : 'Click to show';
};
document.addEventListener('click', toggleSecret, true);
document.addEventListener('keydown', toggleSecret, true);

function lowerFirst(text, apply) {
    return apply ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** Mission status for one participant, as a badge. */
export function missionBadge(participant, drawn) {
    if (!participant.hasAssignment) {
        return drawn ? html`<span class="badge badge-bad"><i class="bi bi-x-circle"></i>Not in draw</span>` : html`<span class="badge">Not drawn</span>`;
    }
    const activity = participant.activity;
    if (activity?.briefingComplete) return html`<span class="badge badge-good" title="Opened ${fmtDateTime(activity.firstReveal)}"><i class="bi bi-soundwave"></i>Heard Santa</span>`;
    if (activity?.firstReveal) return html`<span class="badge badge-good" title="Opened ${fmtDateTime(activity.firstReveal)}"><i class="bi bi-envelope-open"></i>Opened</span>`;
    return html`<span class="badge badge-warn"><i class="bi bi-hourglass-split"></i>Not opened</span>`;
}

export function dayLabel(day, long = false) {
    const date = new Date(day + 'T00:00:00');
    return date.toLocaleDateString('en-GB', long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
}
