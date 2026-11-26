import { api } from '../lib/api.js';
import { html, mount, $, on } from '../lib/dom.js';
import { pageHead, toast, setDirty, info, confirmDialog, downloadCsv } from '../lib/ui.js';
import { plural, fmtDateTime, relTime } from '../lib/format.js';

export async function render(view) {
    let settings = await api('/settings');

    const draw = () => mount(view, html`
        ${pageHead({ title: 'Settings' })}
        <form id="settingsForm" class="stack" novalidate>
            <section class="card">
                <div class="card-head"><h2>Group</h2></div>
                <div class="card-body stack">
                    <label class="switch"><input type="checkbox" name="groupEnabled" ${settings.groupEnabled ? 'checked' : ''}><span class="track"></span>
                        <span class="label">Group is enabled ${info('When off, the group is left out of the group selection for people who take part in several groups, and Google sign-in never opens it. Personal links keep working, and admins can still manage the group here.', { align: 'left' })}</span></label>
                    ${settings.groupEnabled ? '' : html`<div class="callout callout-warn"><i class="bi bi-eye-slash"></i><span>This group is disabled: participants cannot choose it or sign in to it with Google.</span></div>`}
                </div>
            </section>
            <section class="card">
                <div class="card-head"><h2>Missions</h2></div>
                <div class="card-body stack">
                    <label class="switch"><input type="checkbox" name="revealOpen" ${settings.revealOpen ? 'checked' : ''}><span class="track"></span>
                        <span class="label">Participants can open their mission ${info('When off, opening the mission shows the message below. Admins can always open theirs.', { align: 'left' })}</span></label>
                    <label class="switch"><input type="checkbox" name="showFacts" ${settings.showFacts ? 'checked' : ''}><span class="track"></span>
                        <span class="label">Show known facts in the dossier ${info('The "Teadaolevad faktid" list from each participant\'s facts. Off: the facts stay saved but the reveal page neither shows nor receives them.', { align: 'left' })}</span></label>
                    <div class="field">
                        <label for="revealClosedMessage">Message while closed</label>
                        <textarea id="revealClosedMessage" name="revealClosedMessage" rows="2" maxlength="500">${settings.revealClosedMessage}</textarea>
                    </div>
                </div>
            </section>
            <section class="card">
                <div class="card-head"><h2>Season</h2></div>
                <div class="card-body form-grid">
                    <div class="field"><label for="exchangeDate">Gift exchange date</label><input type="date" id="exchangeDate" name="exchangeDate" value="${settings.exchangeDate}"></div>
                    <div class="field"><label for="giftBudget">Gift budget</label><input type="text" id="giftBudget" name="giftBudget" maxlength="100" placeholder="e.g. 30 €" value="${settings.giftBudget}"></div>
                    <div class="field"><label for="agencyFactsPerDossier">Agency facts per dossier</label><input type="number" id="agencyFactsPerDossier" name="agencyFactsPerDossier" min="0" max="10" step="1" value="${settings.agencyFactsPerDossier}"></div>
                </div>
            </section>
            <section class="card">
                <div class="card-head"><h2>Santa's letter</h2><a class="btn btn-sm btn-ghost" href="/kiri" target="_blank" rel="noopener">Open<i class="bi bi-box-arrow-up-right"></i></a></div>
                <div class="card-body field">
                    <label for="letterUrl">Google Doc URL ${info("Use the document's embeddable preview link. Leave empty to hide the letter (and its envelope icon) from this group", { align: 'left' })}</label>
                    <input type="url" id="letterUrl" name="letterUrl" maxlength="1000" placeholder="https://docs.google.com/document/d/…/preview" value="${settings.letterUrl}">
                </div>
            </section>
            <section class="card">
                <div class="card-head"><h2>Organiser notes ${info('Only visible in this panel', { align: 'left' })}</h2></div>
                <div class="card-body"><textarea name="adminNotes" rows="5" maxlength="5000" aria-label="Organiser notes">${settings.adminNotes}</textarea></div>
            </section>
            <div class="savebar"><button type="button" class="btn" id="resetSettings" disabled>Discard changes</button><button type="submit" class="btn btn-primary" disabled>Save settings</button></div>
        </form>
        <section class="card" id="importCard">
            <div class="card-head"><h2>Import data ${info('Adds or updates families and participants from a Secret Santa data file (JSON). People are matched by e-mail, then by name. Nothing that is not in the file is changed or deleted.', { align: 'left' })}</h2></div>
            <div class="card-body stack">
                <div class="field">
                    <label for="importFile">Data file</label>
                    <input type="file" id="importFile" accept=".json,application/json">
                </div>
                <div id="importResult"></div>
            </div>
        </section>
        <section class="card" id="mazeCard">
            <div class="card-head"><h2>Maze game ${info('The maze bonus mission at /labyrint: move the maze to push Santa into the chimney. Every game is recorded, finished or not. The scoreboard ranks fewest moves; with equal moves the faster game (first move to the chimney) ranks higher, and participants see the times only for those tied rows.', { align: 'left' })}</h2>
                <a class="btn btn-sm btn-ghost" href="/labyrint" target="_blank" rel="noopener">Open<i class="bi bi-box-arrow-up-right"></i></a></div>
            <div class="card-body stack" id="mazeBody"><p class="muted">Loading…</p></div>
        </section>`);
    const loadMaze = async () => {
        const body = $('#mazeBody', view);
        if (!body) return;
        try {
            const maze = await api('/maze');
            const leader = maze.board.rows[0];
            mount(body, html`
                <dl class="kv">
                    <dt>Players</dt><dd>${maze.players}</dd>
                    <dt>Games played</dt><dd>${maze.games}</dd>
                    <dt>Finished</dt><dd>${maze.finished}</dd>
                    <dt>Unfinished</dt><dd>${maze.unfinished}</dd>
                    <dt>Leader</dt><dd>${leader ? `${leader.name} (${leader.totalMoves} moves)` : html`<span class="muted">none yet</span>`}</dd>
                    ${maze.archived ? html`<dt>Archived ${info('Games from earlier scoreboard resets. They count nowhere, but are kept and included in the data download.', { align: 'left' })}</dt><dd>${maze.archived}</dd>` : ''}
                </dl>
                ${maze.board.rows.length || maze.board.unfinished.length ? html`
                    <div class="table-wrap"><table class="table">
                        <thead><tr><th class="num">#</th><th>Agent ${info('Real name, with the agent name participants see on the scoreboard instead', { align: 'left' })}</th><th class="num">Best moves</th><th class="num">Time ${info('Time of the best game, from the first move to the door. Breaks ties between equal moves.')}</th><th>Stars</th><th class="num">Games</th><th class="num">Finished</th></tr></thead>
                        <tbody>
                            ${maze.board.rows.map(row => html`<tr>
                                <td class="num">${row.rank}</td>
                                <td class="nowrap">${row.name}${row.agentName ? html` <span class="muted">· ${row.agentName}</span>` : ''}${row.first ? html` <span class="badge badge-accent">first</span>` : ''}${row.cheats ? html` <span class="badge badge-warn" title="Finished ${plural(row.cheats, 'game')} with the hidden cheat code (up up down down left right left right = 67 moves)">cheat code</span>` : ''}</td>
                                <td class="num">${row.totalMoves}</td>
                                <td class="num">${fmtDuration(row.durationMs)}</td>
                                <td class="nowrap">${'★'.repeat(row.stars)}${'☆'.repeat(Math.max(0, 3 * maze.board.levelCount - row.stars))}</td>
                                <td class="num">${row.games}</td>
                                <td class="num">${row.finished}</td>
                            </tr>`)}
                            ${maze.board.unfinished.map(player => html`<tr>
                                <td class="num muted">–</td>
                                <td class="nowrap">${player.name}${player.agentName ? html` <span class="muted">· ${player.agentName}</span>` : ''}</td>
                                <td class="num muted" title="Moves in their latest unfinished game">${player.latestMoves ?? 0} so far</td>
                                <td class="num muted">–</td>
                                <td class="muted">not finished</td>
                                <td class="num">${player.games}</td>
                                <td class="num">0</td>
                            </tr>`)}
                        </tbody>
                    </table></div>` : ''}
                ${maze.recent.length ? html`
                    <h3 class="section-title">Recent games</h3>
                    <div class="table-wrap"><table class="table">
                        <thead><tr><th>Last move</th><th>Who</th><th>Status</th><th class="num">Moves</th><th class="num">Incl. undone</th><th class="num">Time</th><th>Input</th></tr></thead>
                        <tbody>${maze.recent.map(game => html`<tr>
                            <td class="nowrap" title="Started ${fmtDateTime(game.startedAt)}">${relTime(game.updatedAt)}</td>
                            <td class="nowrap">${game.name}</td>
                            <td class="nowrap">${game.status === 'finished' ? html`<span class="badge badge-good">Finished</span>`
                                : game.endReason === 'restarted' ? html`<span class="badge">Restarted</span>` : html`<span class="badge">Unfinished</span>`}${game.cheat ? html` <span class="badge badge-warn">cheat code</span>` : ''}</td>
                            <td class="num">${game.moves}</td>
                            <td class="num">${game.actions}</td>
                            <td class="num">${game.durationMs !== null ? fmtDuration(game.durationMs) : html`<span class="muted">–</span>`}</td>
                            <td class="nowrap">${game.input ?? html`<span class="muted">–</span>`}</td>
                        </tr>`)}</tbody>
                    </table></div>` : ''}
                <div class="page-actions">
                    <button type="button" class="btn" data-maze-export="json" ${maze.games || maze.archived ? '' : 'disabled'}><i class="bi bi-download"></i>All data (JSON)</button>
                    <button type="button" class="btn" data-maze-export="games" ${maze.games || maze.archived ? '' : 'disabled'}><i class="bi bi-filetype-csv"></i>Games CSV</button>
                    <button type="button" class="btn" data-maze-export="events" ${maze.games || maze.archived ? '' : 'disabled'}><i class="bi bi-filetype-csv"></i>Events CSV</button>
                    ${info('Everything recorded about the maze in this group, archived games included: every game with every move, undo, wall hit, restart and pause, plus when people opened the maze and on which device. JSON has it all in one file; the CSVs are for spreadsheets (one row per game, one row per event).', { align: 'left' })}
                </div>
                <div><button type="button" class="btn btn-danger" id="mazeReset" ${maze.games ? '' : 'disabled'}><i class="bi bi-arrow-counterclockwise"></i>Reset scoreboard</button></div>`);
        } catch (err) {
            mount(body, html`<div class="callout callout-danger"><i class="bi bi-exclamation-octagon"></i>${err.message}</div>`);
        }
    };
    draw();
    loadMaze();

    const setFormDirty = value => {
        setDirty(value);
        view.querySelector('button[type=submit]').disabled = !value;
        $('#resetSettings', view).disabled = !value;
    };
    on(view, 'input', '#settingsForm', () => setFormDirty(true));
    on(view, 'change', '#settingsForm', () => setFormDirty(true));
    on(view, 'click', '#resetSettings', () => { draw(); loadMaze(); setDirty(false); });
    on(view, 'click', '#mazeReset', async () => {
        const ok = await confirmDialog({
            title: 'Reset the maze scoreboard',
            message: "Empties the scoreboard, e.g. after testing: every game so far stops counting and players start from zero. The games are archived, not deleted, and stay in the data download.",
            confirmLabel: 'Reset',
            danger: true,
        });
        if (!ok) return;
        try {
            const { archived } = await api('/maze', { method: 'DELETE' });
            toast(`Scoreboard reset (${plural(archived, 'game')} archived)`);
            loadMaze();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    on(view, 'click', '[data-maze-export]', async (event, button) => {
        try {
            downloadMazeData(button.dataset.mazeExport, await api('/maze/export'));
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    // Import: choosing a file runs a dry run and shows what would change; the button applies it.
    const importFile = () => $('#importFile', view).files?.[0] ?? null;
    const showImport = content => mount($('#importResult', view), content);
    const sendImport = dryRun => {
        const form = new FormData();
        form.append('file', importFile());
        return api('/import' + (dryRun ? '?dryRun=true' : ''), { method: 'POST', form });
    };
    on(view, 'change', '#importFile', async () => {
        if (!importFile()) { showImport(''); return; }
        showImport(html`<p class="muted">Checking the file…</p>`);
        try {
            const preview = await sendImport(true);
            showImport(html`${importSummary(preview)}
                <div><button type="button" class="btn btn-primary" id="importRun"><i class="bi bi-box-arrow-in-down"></i>Import</button></div>`);
        } catch (err) {
            showImport(importErrors(err));
        }
    });
    on(view, 'click', '#importRun', async (event, button) => {
        const ok = await confirmDialog({
            title: 'Import data',
            message: 'Apply the changes listed on the page? Participants that are updated take every field from the file, including their current assignment.',
            confirmLabel: 'Import',
        });
        if (!ok) return;
        button.disabled = true;
        try {
            const result = await sendImport(false);
            $('#importFile', view).value = '';
            showImport(importSummary(result));
            toast('Import finished');
        } catch (err) {
            button.disabled = false;
            showImport(importErrors(err));
        }
    });
    on(view, 'submit', '#settingsForm', async event => {
        event.preventDefault();
        const form = event.target;
        const data = new FormData(form);
        try {
            settings = await api('/settings', {
                method: 'PUT',
                body: {
                    groupEnabled: data.get('groupEnabled') === 'on',
                    revealOpen: data.get('revealOpen') === 'on',
                    showFacts: data.get('showFacts') === 'on',
                    revealClosedMessage: String(data.get('revealClosedMessage')),
                    exchangeDate: String(data.get('exchangeDate')),
                    giftBudget: String(data.get('giftBudget')),
                    letterUrl: String(data.get('letterUrl')),
                    adminNotes: String(data.get('adminNotes')),
                    agencyFactsPerDossier: parseInt(String(data.get('agencyFactsPerDossier')), 10) || 0,
                },
            });
            setDirty(false);
            draw();
            loadMaze();
            toast('Settings saved');
        } catch (err) {
            toast(err.message, 'error');
        }
    });
    return () => setDirty(false);
}

function importSummary(result) {
    const list = names => names.length ? names.join(', ') : html`<span class="muted">none</span>`;
    return html`
        <div class="callout ${result.dryRun ? '' : 'callout-good'}"><i class="bi bi-${result.dryRun ? 'info-circle' : 'check-circle'}"></i>
            <span>${result.dryRun ? 'Nothing has changed yet. The import will:' : 'Imported:'}
                ${result.source ? html` <span class="muted">(${result.source}${result.exportedAt ? `, ${result.exportedAt.slice(0, 10)}` : ''})</span>` : ''}</span></div>
        <dl class="kv">
            <dt>New participants</dt><dd>${result.participants.created.length}</dd>
            <dt>Updated participants</dt><dd>${result.participants.updated.length}</dd>
            <dt>New families</dt><dd>${result.families.created.length}</dd>
            <dt>Existing families</dt><dd>${result.families.existing.length}</dd>
            <dt>Assignments</dt><dd>${plural(result.assignments, 'participant')}</dd>
        </dl>
        <dl class="kv">
            <dt>New</dt><dd>${list(result.participants.created)}</dd>
            <dt>Updated</dt><dd>${list(result.participants.updated)}</dd>
            <dt>Families</dt><dd>${list([...result.families.created, ...result.families.existing])}</dd>
            <dt>Admins</dt><dd>${list(result.admins)}</dd>
        </dl>
        ${result.warnings.length ? html`<div class="callout callout-warn"><i class="bi bi-exclamation-triangle"></i><ul style="margin:0;padding-left:16px">${result.warnings.map(w => html`<li>${w}</li>`)}</ul></div>` : ''}`;
}

function importErrors(err) {
    const problems = err.details ?? [err.message];
    return html`<div class="callout callout-danger"><i class="bi bi-exclamation-octagon"></i>
        <span>The file was not imported. ${problems.length > 1 ? 'Problems:' : ''}
            <ul style="margin:4px 0 0;padding-left:16px">${problems.map(p => html`<li>${p}</li>`)}</ul></span></div>`;
}

/** 83000 -> "1:23", 3723000 -> "1:02:03". */
function fmtDuration(ms) {
    const total = Math.max(0, Math.round((ms ?? 0) / 1000));
    const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, sec = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Saves the maze data download (GET /maze/export) as JSON, or as one CSV of games or of events. */
function downloadMazeData(format, data) {
    const stamp = new Date(data.exportedAt).toISOString().slice(0, 10);
    const base = `maze-${data.group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || data.group.id}-${stamp}`;
    if (format === 'json') {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        link.download = `${base}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        return;
    }
    const col = (label, key = label) => ({ label, value: row => row[key] });
    if (format === 'games') {
        downloadCsv(`${base}-games.csv`, [
            col('gameId', 'id'), col('userId'), col('name'), col('agentName'), col('level'), col('status'), col('endReason'), col('cheat'), col('archivedAt'),
            col('input'), col('moveCount'), col('actions'), col('undos'), col('par'), col('stars'), col('startedAt'), col('finishedAt'),
            col('durationMs'), col('lastActivityAt'), { label: 'events', value: game => game.events.length },
            { label: 'wallHits', value: game => game.events.filter(e => e.type === 'blocked').length }, col('moves'),
        ], data.games);
        return;
    }
    const rows = data.games.flatMap(game => game.events.map(event => ({ ...event, gameId: game.id, userId: game.userId, name: game.name, agentName: game.agentName, level: game.level })));
    downloadCsv(`${base}-events.csv`, [
        col('gameId'), col('userId'), col('name'), col('agentName'), col('level'), col('seq'), col('type'), col('dir'), col('input'), col('reason'),
        { label: 'ballX', value: e => e.ball?.[0] }, { label: 'ballY', value: e => e.ball?.[1] },
        { label: 'mazeX', value: e => e.maze?.[0] }, { label: 'mazeY', value: e => e.maze?.[1] }, col('at'),
    ], rows);
}
