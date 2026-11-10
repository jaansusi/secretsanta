import { api } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, confirmDialog, formDialog, toast, emptyState, info, meter } from '../lib/ui.js';
import { fmtBytes, fmtDateTime, fmtNumber } from '../lib/format.js';
import { setQuery } from '../lib/router.js';

const TABS = [
    { key: 'intros', label: 'Intros', kind: 'intro' },
    { key: 'names', label: 'Name lines', kind: 'name' },
    { key: 'outros', label: 'Outros', kind: 'outro' },
    { key: 'participants', label: 'Participants' },
];
const STATUS = {
    ready: html`<span class="badge badge-good">Ready</span>`,
    stale: html`<span class="badge badge-warn" title="The text changed after this clip was generated">Out of date</span>`,
    missing: html`<span class="badge">Missing</span>`,
};
const POLL_MS = 1500;

export async function render(view, { query }) {
    let library = await api('/audio');
    let tab = TABS.some(t => t.key === query.get('tab')) ? query.get('tab') : 'intros';
    let pollTimer = null;
    const player = new Audio();
    let queue = [];
    let playingButton = null;

    // ---------- Playback ----------
    const setIcon = (button, playing) => {
        const icon = button?.querySelector('i');
        if (icon) icon.className = `bi bi-${playing ? 'pause-fill' : button.dataset.icon || 'play-fill'}`;
    };
    const stop = () => { player.pause(); queue = []; setIcon(playingButton, false); playingButton = null; };
    const playSequence = (urls, button) => {
        stop();
        queue = urls.slice(1);
        playingButton = button;
        setIcon(button, true);
        player.src = urls[0];
        player.play().catch(() => stop());
    };
    player.addEventListener('ended', () => {
        if (queue.length) { player.src = queue.shift(); player.play().catch(() => stop()); } else stop();
    });
    const playButton = (clip, label) => clip
        ? html`<button class="icon-button player-btn" data-play="${clip.url}" aria-label="Play ${label}" title="Play"><i class="bi bi-play-fill"></i></button>`
        : html`<span class="player-btn" style="display:inline-block"></span>`;

    // ---------- Rendering ----------
    const configured = () => library.elevenLabs.configured;
    const running = () => !!library.job?.running;
    const outdatedCount = () => library.summary.stale + library.summary.missing;

    const jobPanel = () => {
        const job = library.job;
        if (!job) return '';
        const finished = !job.running;
        return html`<section class="card" style="margin-bottom:16px">
            <div class="card-head">
                <h2>${job.running ? 'Generating…' : job.cancelled ? 'Generation cancelled' : 'Generation finished'}</h2>
                ${job.running ? html`<button class="btn btn-sm" id="cancelJob"><i class="bi bi-stop-circle"></i>Cancel</button>`
                    : html`<span class="count">${fmtDateTime(job.finishedAt)}</span>`}
            </div>
            <div class="card-body">
                <div style="display:flex;justify-content:space-between"><span class="ink-2">${job.current ?? (finished ? `${job.done} generated` : 'Starting')}</span>
                    <span class="num">${job.done + job.failed} / ${job.total}${job.failed ? html` · <span class="status-fail">${job.failed} failed</span>` : ''}</span></div>
                ${meter(job.done + job.failed, job.total)}
                ${job.errors.length ? html`<ul class="hint" style="margin:10px 0 0;padding-left:18px">${job.errors.map(e => html`<li>${e}</li>`)}</ul>` : ''}
            </div>
        </section>`;
    };

    const lineTable = kind => {
        const rows = kind === 'intro' ? library.intros : library.outros;
        if (!rows.length) return emptyState('mic', `No ${kind}s yet`);
        return html`<div class="table-wrap"><table class="table">
            <thead><tr><th style="width:1%">#</th><th>Text</th><th>Clip</th><th class="right"></th></tr></thead>
            <tbody>${rows.map((line, i) => html`<tr>
                <td class="num muted">${i + 1}</td>
                <td>${line.text}</td>
                <td class="nowrap">${playButton(line.clip, `${kind} ${i + 1}`)} ${STATUS[line.status]}
                    ${line.clip ? info(`${fmtBytes(line.clip.bytes)} · generated ${fmtDateTime(line.clip.generatedAt)}${line.status === 'stale' ? ` · says: "${line.clip.text}"` : ''}`, { align: 'right' }) : ''}</td>
                <td class="actions">${lineActions(line, i, rows.length, { lineId: line.id, scope: 'clip', force: line.status === 'ready' })}</td>
            </tr>`)}</tbody></table></div>`;
    };

    const lineActions = (line, index, count, scope) => html`
        <button class="icon-button" data-generate='${JSON.stringify(scope)}' ${configured() && !running() ? '' : 'disabled'} title="${scope.force ? 'Regenerate' : 'Generate'}" aria-label="${scope.force ? 'Regenerate' : 'Generate'}"><i class="bi bi-${scope.force ? 'arrow-repeat' : 'magic'}"></i></button>
        <button class="icon-button" data-edit-line="${line.id}" title="Edit text" aria-label="Edit text"><i class="bi bi-pencil"></i></button>
        <button class="icon-button" data-move="${line.id}" data-direction="up" ${index === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up"><i class="bi bi-arrow-up"></i></button>
        <button class="icon-button" data-move="${line.id}" data-direction="down" ${index === count - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down"><i class="bi bi-arrow-down"></i></button>
        <button class="icon-button danger" data-delete-line="${line.id}" title="Delete" aria-label="Delete"><i class="bi bi-trash3"></i></button>`;

    const nameLineTable = () => {
        if (!library.nameLines.length) return emptyState('mic', 'No name lines yet');
        const people = library.participants.length;
        return html`<div class="table-wrap"><table class="table">
            <thead><tr><th style="width:1%">#</th><th>Text</th><th>Clips</th><th class="right"></th></tr></thead>
            <tbody>${library.nameLines.map((line, i) => {
                const statuses = library.participants.map(p => p.clips.find(c => c.lineId === line.id)?.status);
                const ready = statuses.filter(s => s === 'ready').length;
                return html`<tr>
                    <td class="num muted">${i + 1}</td>
                    <td>${highlightName(line.text)}</td>
                    <td class="nowrap"><span class="num">${ready} / ${people}</span> ${ready === people ? STATUS.ready : statuses.includes('stale') ? STATUS.stale : STATUS.missing}</td>
                    <td class="actions">${lineActions(line, i, library.nameLines.length, { lineId: line.id, scope: 'line', force: ready === people })}</td>
                </tr>`;
            })}</tbody></table></div>`;
    };

    const participantTable = () => {
        if (!library.participants.length) return emptyState('people', 'No participants yet');
        if (!library.nameLines.length) return emptyState('mic', 'Add a name line first');
        const canBrief = library.intros.some(l => l.status === 'ready') && library.outros.some(l => l.status === 'ready');
        return html`<div class="table-wrap"><table class="table">
            <thead><tr><th>Participant</th><th>Name clips</th><th class="right"></th></tr></thead>
            <tbody>${library.participants.map(p => {
                const outdated = p.clips.filter(c => c.status !== 'ready').length;
                const readyClips = p.clips.filter(c => c.status === 'ready');
                return html`<tr>
                    <td><a class="primary-cell" href="/admin/participants/${p.id}">${p.name}</a></td>
                    <td><span class="pill-list">${p.clips.map((c, i) => html`<span class="badge ${c.status === 'ready' ? 'badge-good' : c.status === 'stale' ? 'badge-warn' : ''}" title="${c.status === 'ready' ? 'Ready' : c.status === 'stale' ? 'Out of date' : 'Missing'}">${c.clip ? playButton(c.clip, `${p.name} line ${i + 1}`) : ''}${i + 1}</span>`)}</span></td>
                    <td class="actions">
                        ${canBrief && readyClips.length ? html`<button class="btn btn-sm" data-briefing="${p.id}" data-icon="play-circle"><i class="bi bi-play-circle"></i>Briefing</button>` : ''}
                        <button class="btn btn-sm" data-generate='${JSON.stringify({ scope: 'participant', userId: p.id, force: outdated === 0 })}' ${configured() && !running() ? '' : 'disabled'}>
                            <i class="bi bi-${outdated ? 'magic' : 'arrow-repeat'}"></i>${outdated ? `Generate ${outdated}` : 'Regenerate'}</button>
                    </td>
                </tr>`;
            })}</tbody></table></div>`;
    };

    const tabContent = () => {
        const current = TABS.find(t => t.key === tab);
        const addButton = current.kind ? html`<button class="btn btn-sm" id="addLine"><i class="bi bi-plus-lg"></i>Add ${current.kind === 'name' ? 'name line' : current.kind}</button>` : '';
        const help = {
            intros: 'One is picked per visit, before the recipient is known',
            names: 'Use {name} where the name goes. Each line is generated for every participant.',
            outros: 'One is picked per visit, after the name line',
            participants: 'Number = name line. Green is ready, yellow is out of date.',
        }[tab];
        return html`<section class="card">
            <div class="card-head"><h2>${current.label} ${info(help, { align: 'left' })}</h2>${addButton}</div>
            ${tab === 'intros' ? lineTable('intro') : tab === 'outros' ? lineTable('outro') : tab === 'names' ? nameLineTable() : participantTable()}
        </section>`;
    };

    const draw = () => {
        const s = library.summary;
        mount(view, html`
            ${pageHead({
                title: 'Santa audio',
                help: 'Briefing = intro + name line + outro. Only up-to-date clips are played on the site.',
                actions: html`<button class="btn btn-primary" id="generateOutdated" ${configured() && !running() && outdatedCount() ? '' : 'disabled'}>
                    <i class="bi bi-magic"></i>Generate outdated${outdatedCount() ? ` (${outdatedCount()})` : ''}</button>`,
            })}
            ${!configured() ? html`<div class="callout callout-warn"><i class="bi bi-exclamation-triangle"></i><span>ElevenLabs is not configured ${info('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in the server environment')}</span></div>` : ''}
            <div id="jobPanel">${jobPanel()}</div>
            <div class="tiles">
                <div class="tile"><div class="tile-label">Ready</div><div class="tile-value">${fmtNumber(s.ready)}</div></div>
                <div class="tile"><div class="tile-label">Out of date${info('Text changed after generating, e.g. a participant was renamed', { align: 'right' })}</div><div class="tile-value">${fmtNumber(s.stale)}</div></div>
                <div class="tile"><div class="tile-label">Missing</div><div class="tile-value">${fmtNumber(s.missing)}</div></div>
                <div class="tile"><div class="tile-label">Characters to generate${info('ElevenLabs bills per character', { align: 'right' })}</div><div class="tile-value">${fmtNumber(s.outdatedCharacters)}</div></div>
            </div>
            <div class="tabs" role="tablist">${TABS.map(t => html`<button role="tab" data-tab="${t.key}" class="${t.key === tab ? 'active' : ''}" aria-selected="${t.key === tab}">${t.label}</button>`)}</div>
            <div id="tabContent">${tabContent()}</div>`);
    };

    // ---------- Actions ----------
    const refresh = async () => { library = await api('/audio'); draw(); };
    const poll = () => {
        clearTimeout(pollTimer);
        if (!running()) return;
        pollTimer = setTimeout(async () => {
            try {
                const job = await api('/audio/job');
                if (job && !job.running) {
                    await refresh();
                    toast(job.failed ? `Generated ${job.done}, ${job.failed} failed` : `Generated ${job.done} clip${job.done === 1 ? '' : 's'}`, job.failed ? 'error' : 'info');
                    return;
                }
                library.job = job;
                mount($('#jobPanel', view), jobPanel());
            } catch { /* keep polling */ }
            poll();
        }, POLL_MS);
    };

    const generate = async scope => {
        try {
            const { clips, characters } = await api('/audio/preview', { method: 'POST', body: scope });
            if (!clips) return toast('Nothing to generate');
            const ok = await confirmDialog({
                title: `Generate ${clips} clip${clips === 1 ? '' : 's'}?`,
                message: `${fmtNumber(characters)} characters will be sent to ElevenLabs.`,
                confirmLabel: 'Generate',
            });
            if (!ok) return;
            library.job = await api('/audio/generate', { method: 'POST', body: scope });
            draw();
            poll();
        } catch (err) {
            toast(err.message, 'error');
        }
    };

    const lineDialog = (kind, line) => formDialog({
        title: line ? 'Edit text' : `Add ${kind === 'name' ? 'name line' : kind}`,
        submitLabel: line ? 'Save' : 'Add',
        body: html`<div class="field">
            <label for="lineText">Text ${info(kind === 'name' ? '{name} is replaced with the participant\'s name. [whispers], [laughs] etc. are ElevenLabs audio tags.' : '[whispers], [laughs] etc. are ElevenLabs audio tags', { align: 'left' })}</label>
            <textarea id="lineText" name="text" rows="5" maxlength="1000" required>${line?.text ?? (kind === 'name' ? '{name}' : '')}</textarea>
        </div>`,
        onSubmit: form => {
            const text = new FormData(form).get('text');
            return line
                ? api(`/audio/lines/${line.id}`, { method: 'PATCH', body: { text } })
                : api('/audio/lines', { method: 'POST', body: { kind, text } });
        },
    });
    const findLine = id => [...library.intros, ...library.outros, ...library.nameLines].find(l => String(l.id) === String(id));
    const kindOf = id => library.intros.some(l => String(l.id) === String(id)) ? 'intro' : library.outros.some(l => String(l.id) === String(id)) ? 'outro' : 'name';

    on(view, 'click', '[data-tab]', (e, button) => { stop(); tab = button.dataset.tab; setQuery({ tab: tab === 'intros' ? null : tab }); draw(); });
    on(view, 'click', '#generateOutdated', () => generate({ scope: 'outdated' }));
    on(view, 'click', '[data-generate]', (e, button) => generate(JSON.parse(button.dataset.generate)));
    on(view, 'click', '#cancelJob', async () => { library.job = await api('/audio/job/cancel', { method: 'POST' }); mount($('#jobPanel', view), jobPanel()); });
    on(view, 'click', '#addLine', async () => {
        const kind = TABS.find(t => t.key === tab).kind;
        const result = await lineDialog(kind, null);
        if (result) { library = result; draw(); toast('Line added'); }
    });
    on(view, 'click', '[data-edit-line]', async (e, button) => {
        const line = findLine(button.dataset.editLine);
        const result = await lineDialog(kindOf(line.id), line);
        if (result) { library = result; draw(); toast('Text saved'); }
    });
    on(view, 'click', '[data-move]', async (e, button) => {
        try {
            library = await api(`/audio/lines/${button.dataset.move}/move`, { method: 'POST', body: { direction: button.dataset.direction } });
            draw();
        } catch (err) { toast(err.message, 'error'); }
    });
    on(view, 'click', '[data-delete-line]', async (e, button) => {
        const line = findLine(button.dataset.deleteLine);
        const ok = await confirmDialog({ title: 'Delete this line?', message: html`“${line.text}”<br><br>Its generated clips are deleted too.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        try {
            library = await api(`/audio/lines/${line.id}`, { method: 'DELETE' });
            draw();
            toast('Line deleted');
        } catch (err) { toast(err.message, 'error'); }
    });
    on(view, 'click', '[data-play]', (e, button) => {
        if (playingButton === button) return stop();
        playSequence([button.dataset.play], button);
    });
    on(view, 'click', '[data-briefing]', (e, button) => {
        if (playingButton === button) return stop();
        const person = library.participants.find(p => String(p.id) === button.dataset.briefing);
        const pick = list => list[Math.floor(Math.random() * list.length)];
        const intros = library.intros.filter(l => l.status === 'ready').map(l => l.clip.url);
        const outros = library.outros.filter(l => l.status === 'ready').map(l => l.clip.url);
        const names = person.clips.filter(c => c.status === 'ready').map(c => c.clip.url);
        playSequence([pick(intros), pick(names), pick(outros)], button);
    });

    draw();
    poll();
    return () => { stop(); clearTimeout(pollTimer); };
}

/** Shows the {name} placeholder as a badge inside the text. */
function highlightName(text) {
    return text.split('{name}').map((part, i) => html`${i ? html`<span class="badge badge-accent">name</span>` : ''}${part}`);
}
