// Maze minigame, shown in place of the dossier (window.MazeView, used by index.js). Rules: /js/maze-engine.js,
// shared with the server, which replays every solution.
(function () {
    const C = 40;                      // one cell in SVG user units
    const NS = 'http://www.w3.org/2000/svg';
    const $ = id => document.getElementById(id);
    const Engine = window.MazeEngine;

    const data = { levels: [], results: {}, board: null };
    const game = { index: 0, level: null, state: null, history: [], moves: '', solved: false, submitting: false, inputs: '' };
    // Not shown anywhere: swiping up, up, down, down, left, right, left, right ends the game with 67 moves.
    const SECRET = 'UUDDLRLR';
    // The recorded game on the server: created on the first move, its path saved as the agent plays.
    // `log` holds the events not yet saved (each numbered by `seq`); `away` is set while the agent has
    // left the maze mid-game, so coming back is logged once.
    const record = { attempt: 0, gameId: null, actions: 0, starting: null, timer: null, synced: '', log: [], seq: 0, away: false };
    const MAX_LOG = 2000;              // unsaved events kept (offline for a long time: the oldest go)
    const LOG_BATCH = 300;             // events per save (keeps a closing page's save small)
    const FINISH_BATCH = 500;          // events a finish may carry (the server's limit per save)
    let parts = null;                  // SVG elements of the current level

    // ---- server --------------------------------------------------------------------------------

    function api(path, body, { keepalive = false } = {}) {
        return fetch('/labyrint/api/' + path, {
            method: body === undefined ? 'GET' : 'POST',
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: 'same-origin',
            keepalive,                 // lets the last save finish while the page is closing
        }).then(async response => {
            if (response.status === 401) {
                location.href = '/';
                throw new Error('Logi uuesti sisse.');
            }
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw Object.assign(new Error(json.message || 'Midagi läks valesti, proovi uuesti.'), { status: response.status });
            return json;
        });
    }

    // ---- saved progress (this browser only) ----------------------------------------------------

    const progressKey = id => 'maze-progress-' + id;
    function saveProgress() {
        const value = JSON.stringify({ gameId: record.gameId, moves: game.moves, actions: record.actions, log: record.log, seq: record.seq });
        try { localStorage.setItem(progressKey(game.level.id), value); } catch (e) { /* no storage */ }
    }
    function clearProgress(id) {
        try { localStorage.removeItem(progressKey(id)); } catch (e) { /* no storage */ }
    }
    /**
     * { gameId, moves, actions, log, seq } of an unfinished game in this browser (gameId null if never
     * saved; log: its events not yet saved, seq: the next event number).
     */
    function loadProgress(id) {
        let raw = '';
        try { raw = localStorage.getItem(progressKey(id)) || ''; } catch (e) { return { gameId: null, moves: '', actions: 0, log: [], seq: 0 }; }
        try {
            const saved = JSON.parse(raw);
            if (saved && typeof saved.moves === 'string') {
                const log = Array.isArray(saved.log) ? saved.log.filter(e => e && Number.isInteger(e.seq)) : [];
                const seq = Math.max(saved.seq | 0, ...log.map(e => e.seq + 1));
                return { gameId: Number.isInteger(saved.gameId) ? saved.gameId : null, moves: saved.moves, actions: saved.actions | 0, log, seq };
            }
        } catch (e) { /* an older plain move string */ }
        return { gameId: null, moves: /^[UDLR]*$/.test(raw) ? raw : '', actions: raw.length, log: [], seq: 0 };
    }

    // ---- recording games on the server ---------------------------------------------------------

    /**
     * The server id of the current game, creating the game on first use. The promise gives the id even
     * if a restart came in between, so the old attempt's last save still reaches its game.
     */
    function ensureGame() {
        if (record.gameId) return Promise.resolve(record.gameId);
        if (record.starting) return record.starting;
        const attempt = record.attempt;
        const starting = api('games', { level: game.level.id }).then(response => response.gameId);
        record.starting = starting;
        starting.then(gameId => {
            // A restart or level switch while this was in flight: that attempt has its own game.
            if (attempt !== record.attempt) return;
            record.gameId = gameId;
            record.starting = null;
            saveProgress();
        }, () => {
            if (attempt === record.attempt) record.starting = null;
        });
        return starting;
    }

    /**
     * Adds an event to the game's log: `type` with its details (dir, input, reason) and where the bauble
     * and the maze are now. Saved with the next save; nothing is logged once the game is over.
     */
    function note(type, details) {
        if (game.solved || !game.state) return;
        const s = game.state;
        record.log.push(Object.assign({ seq: record.seq++, type, at: Date.now(), ball: [s.bx, s.by], maze: [s.ox, s.oy] }, details));
        if (record.log.length > MAX_LOG) record.log.splice(0, record.log.length - MAX_LOG);
    }

    /**
     * The events for the next save, with this browser's clock so the server can line their times up.
     * A finish sends the newest `limit` (it is the game's last save); other saves the oldest, in order.
     */
    function logPart(limit) {
        return { events: limit ? record.log.slice(-limit) : record.log.slice(0, LOG_BATCH), now: Date.now() };
    }

    /** Drops events the server has stored, once a save with them went through. */
    function logSaved(events) {
        if (!events.length) return;
        const last = events[events.length - 1].seq;
        record.log = record.log.filter(e => e.seq > last);
    }

    /** True while a game is under way: moves have been made and it is not over. */
    function playing() {
        return !game.solved && !!(record.gameId || record.starting || game.moves);
    }

    /** Saves the current path soon (moves come in bursts; one save covers them). */
    function scheduleSync() {
        clearTimeout(record.timer);
        record.timer = setTimeout(() => syncNow(), 800);
    }

    /**
     * Saves the current path and new events now, if anything changed since the last save. Never
     * interrupts play. A game still being created is saved once it exists.
     */
    function syncNow({ keepalive = false } = {}) {
        clearTimeout(record.timer);
        if (game.solved) return Promise.resolve();
        const target = record.gameId ? Promise.resolve(record.gameId) : record.starting;
        if (!target) return Promise.resolve();
        const attempt = record.attempt;
        const body = Object.assign({ moves: game.moves, actions: record.actions }, logPart());
        const key = body.moves + '|' + body.actions;
        if (record.synced === key && !body.events.length) return Promise.resolve();
        let savedTo = null;
        return target
            .then(gameId => api('games/' + (savedTo = gameId) + '/progress', body, { keepalive }))
            .then(() => {
                if (attempt !== record.attempt) return;
                record.synced = key;
                logSaved(body.events);
                saveProgress();
                if (record.log.length) scheduleSync();
            })
            .catch(err => {
                // The game is gone (the admin reset the scoreboard): the next move records a new one.
                if (err.status === 404 && attempt === record.attempt && record.gameId === savedTo) forgetGame();
                /* otherwise the next move or page close tries again */
            });
    }

    /** Drops the current game's server id, so the path so far is recorded as a new game. */
    function forgetGame() {
        record.gameId = null;
        record.starting = null;
        record.synced = '';
        if (!game.solved) saveProgress();   // a finished game's progress is already cleared
    }

    /**
     * Starts recording a fresh attempt: the previous game (if any) keeps its last saved state. `ending`
     * is logged on the previous game first, e.g. { type: 'restart', input: 'button' }.
     */
    function newAttempt(saved, ending) {
        if (ending && playing()) note(ending.type, { input: ending.input });
        syncNow();
        record.attempt++;
        record.gameId = saved ? saved.gameId : null;
        record.actions = saved ? Math.max(saved.actions, saved.moves.length) : 0;
        record.starting = null;
        record.synced = '';
        record.log = saved ? saved.log : [];
        record.seq = saved ? saved.seq : 0;
        record.away = false;
    }

    // ---- helpers -------------------------------------------------------------------------------

    function svg(tag, attrs, parent) {
        const node = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach(key => node.setAttribute(key, attrs[key]));
        if (parent) parent.appendChild(node);
        return node;
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function starsHtml(count, total) {
        const box = el('span', 'stars');
        box.setAttribute('aria-label', count + ' tärni ' + total + '-st');
        for (let i = 0; i < total; i++) box.appendChild(el('i', 'bi ' + (i < count ? 'bi-star-fill' : 'bi-star')));
        return box;
    }

    function moves(n) {
        return n + (n === 1 ? ' käik' : ' käiku');
    }

    /** A game's time as m:ss,t (h:mm:ss,t past an hour), to tenths of a second. */
    function clock(ms) {
        const tenths = Math.round(ms / 100);
        const pad = n => String(n).padStart(2, '0');
        const h = Math.floor(tenths / 36000);
        const m = Math.floor(tenths / 600) % 60;
        const s = Math.floor(tenths / 10) % 60;
        return (h ? h + ':' + pad(m) : m) + ':' + pad(s) + ',' + (tenths % 10);
    }


    function setHint(text) {
        $('hint').textContent = text || '';
    }

    // ---- drawing -------------------------------------------------------------------------------

    function drawLevel() {
        const level = game.level;
        const board = $('board');
        board.innerHTML = '';
        const pad = C * 0.35;
        const W = level.world.w * C;
        const H = level.world.h * C;
        board.setAttribute('viewBox', [-pad, -pad, W + 2 * pad, H + 2 * pad].join(' '));

        // The fixed world: a pencilled grid.
        const grid = svg('g', { class: 'grid' }, board);
        svg('rect', { x: 0, y: 0, width: W, height: H, class: 'world' }, grid);
        for (let x = 1; x < level.world.w; x++) svg('line', { x1: x * C, y1: 0, x2: x * C, y2: H }, grid);
        for (let y = 1; y < level.world.h; y++) svg('line', { x1: 0, y1: y * C, x2: W, y2: y * C }, grid);

        // The chimney: the fixed target cell (drawn in the cell's 40x40 box).
        const door = svg('g', { class: 'door', transform: 'translate(' + level.door.x * C + ' ' + level.door.y * C + ')' }, board);
        svg('circle', { cx: 25, cy: 5, r: 2.6, class: 'chimney-smoke' }, door);
        svg('circle', { cx: 29.5, cy: 2.5, r: 1.9, class: 'chimney-smoke' }, door);
        svg('rect', { x: 9, y: 14, width: 22, height: 22, class: 'chimney-brick' }, door);
        svg('path', { d: 'M9 21 H31 M9 28 H31 M20 14 V21 M14.5 21 V28 M25.5 21 V28 M20 28 V36', class: 'chimney-mortar' }, door);
        svg('rect', { x: 6, y: 9, width: 28, height: 6, rx: 1, class: 'chimney-cap' }, door);
        svg('path', { d: 'M6 10.5 Q6 7 10 7.5 Q13 5.5 17 7.5 Q21 5.5 25 7.5 Q29 5.5 32 7.5 Q34.5 7.5 34 10.5 Z', class: 'chimney-snow' }, door);

        // The maze: one group that slides as a whole.
        const maze = svg('g', { class: 'maze' }, board);
        svg('rect', { x: 0, y: 0, width: level.box.w * C, height: level.box.h * C, class: 'maze-floor' }, maze);
        Object.keys(level.vertical).forEach(k => {
            const [x, y] = k.split(',').map(Number);
            svg('line', { x1: x * C, y1: y * C, x2: x * C, y2: (y + 1) * C, class: 'wall' }, maze);
        });
        Object.keys(level.horizontal).forEach(k => {
            const [x, y] = k.split(',').map(Number);
            svg('line', { x1: x * C, y1: y * C, x2: (x + 1) * C, y2: y * C, class: 'wall' }, maze);
        });

        // Santa, the piece the agent pushes (centred on its cell; the engine still calls it the ball).
        const ball = svg('g', { class: 'ball' }, board);
        const inner = svg('g', { class: 'ball-inner', transform: 'translate(0 2)' }, ball);
        svg('path', { d: 'M-9.5 -6 C-9 -14 -1 -18 6 -16 C9 -15 11 -13 11.5 -10 L9.5 -6 Z', class: 'santa-hat' }, inner);
        svg('circle', { cx: 11.5, cy: -10.5, r: 2.8, class: 'santa-fur' }, inner);
        svg('circle', { cx: 0, cy: -2, r: 7.5, class: 'santa-face' }, inner);
        svg('rect', { x: -11, y: -8.5, width: 22, height: 4.6, rx: 2.3, class: 'santa-fur' }, inner);
        svg('path', { d: 'M-9 -3 Q-11.5 9 0 13.5 Q11.5 9 9 -3 Q6.5 3 0 3 Q-6.5 3 -9 -3 Z', class: 'santa-fur' }, inner);
        svg('path', { d: 'M0 1.2 Q-3.5 -1.2 -6.5 1.8 Q-3 3.8 0 2.4 Q3 3.8 6.5 1.8 Q3.5 -1.2 0 1.2 Z', class: 'santa-fur' }, inner);
        svg('circle', { cx: -2.8, cy: -3, r: 1, class: 'santa-eye' }, inner);
        svg('circle', { cx: 2.8, cy: -3, r: 1, class: 'santa-eye' }, inner);
        svg('circle', { cx: 0, cy: -0.6, r: 1.6, class: 'santa-nose' }, inner);

        parts = { maze, ball, board };
        place(false);
    }

    function place(animate) {
        const s = game.state;
        parts.board.classList.toggle('instant', !animate);
        parts.maze.style.transform = 'translate(' + s.ox * C + 'px, ' + s.oy * C + 'px)';
        parts.ball.style.transform = 'translate(' + (s.bx + 0.5) * C + 'px, ' + (s.by + 0.5) * C + 'px)';
    }

    function shake() {
        const board = parts.board;
        board.classList.remove('bump');
        void board.getBoundingClientRect();   // restart the animation
        board.classList.add('bump');
        // A short buzz on phones that support it (Android); iOS ignores this.
        try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* not allowed */ }
    }

    function renderStatus() {
        const level = game.level;
        $('moveCount').textContent = game.moves.length;
        $('undoButton').disabled = game.history.length === 0 || game.solved;
        $('restartButton').disabled = game.moves.length === 0 && !game.solved;
    }

    function renderLevels() {
        const nav = $('levels');
        nav.innerHTML = '';
        nav.classList.toggle('hidden', data.levels.length < 2);   // tabs only when there is a choice
        data.levels.forEach((level, index) => {
            const result = data.results[level.id];
            const button = el('button', 'level-tab' + (index === game.index ? ' active' : '') + (result ? ' done' : ''));
            button.type = 'button';
            button.dataset.index = index;
            button.appendChild(el('span', 'level-no', String(index + 1)));
            button.appendChild(starsHtml(result ? result.stars : 0, 3));
            button.setAttribute('aria-label', (index + 1) + '. tase: ' + level.name + (result ? ', läbitud ' + moves(result.moves) + 'ga' : ''));
            nav.appendChild(button);
        });
    }

    function renderBoard() {
        const board = data.board;
        const list = $('leaderboard');
        list.innerHTML = '';
        board.rows.forEach(row => {
            const item = el('li', row.me ? 'me' : '');
            item.appendChild(el('span', 'rank rank-' + Math.min(row.rank, 4), String(row.rank)));
            const who = el('span', 'who');
            who.appendChild(document.createTextNode(row.name));
            item.appendChild(who);
            const score = el('span', 'score', (board.levelCount > 1 ? row.levelsDone + '/' + board.levelCount + ' · ' : '') + moves(row.totalMoves));
            // The time only where someone has as many moves: there it decided the order.
            if (row.tieTimeMs != null) score.appendChild(el('span', 'tie-time', clock(row.tieTimeMs)));
            item.appendChild(score);
            list.appendChild(item);
        });

        // Agents who have played but not reached the door yet.
        const pending = $('unfinishedList');
        pending.innerHTML = '';
        board.unfinished.forEach(player => {
            const item = el('li', player.me ? 'me' : '');
            item.appendChild(el('span', 'who', player.name));
            pending.appendChild(item);
        });
        $('unfinishedBox').classList.toggle('hidden', board.unfinished.length === 0);

        // One line for the collapsed scoreboard: your place once you have finished, else the leader.
        const mine = board.rows.find(row => row.me);
        const leader = board.rows[0];
        $('boardPeek').textContent = mine
            ? mine.rank + '. koht'
            : leader ? 'Liider: ' + leader.name : '';
    }

    // ---- game flow -----------------------------------------------------------------------------

    function openLevel(index, { resume = true, ending = null } = {}) {
        const def = data.levels[index];
        const saved = resume ? loadProgress(def.id) : null;
        newAttempt(saved && (saved.moves || saved.gameId) ? saved : null, ending);
        game.index = index;
        game.level = Object.assign(Engine.parseLevel(def), { par: def.par });
        game.state = game.level.start;
        game.history = [];
        game.moves = '';
        game.solved = false;
        game.inputs = '';
        $('win').classList.add('hidden');
        setHint('');
        drawLevel();
        // Pick up where this browser left off (an unfinished game is kept until solved or restarted).
        for (const move of saved ? saved.moves : '') {
            const result = Engine.step(game.level, game.state, move);
            if (result.blocked || Engine.solved(game.level, game.state)) break;
            game.history.push(game.state);
            game.state = result.state;
            game.moves += move;
        }
        place(false);
        renderLevels();
        renderStatus();
        if (game.moves.length) setHint('Jätkad pooleli jäänud katset.');
        if (saved && (saved.moves || saved.gameId)) {
            note('resume');
            saveProgress();
        }
    }

    /** One move; `input` is how it was made (touch, mouse, pen or key), for the event log. */
    function move(direction, input) {
        if (game.solved || game.submitting) return;
        // Every swipe counts here, including impossible ones: the sequence is rarely a playable path.
        game.inputs = (game.inputs + direction).slice(-SECRET.length);
        if (game.inputs === SECRET) {
            note('cheat', { dir: direction, input });
            end(gameId => api('games/' + gameId + '/cheat', Object.assign({ code: SECRET }, logPart(FINISH_BATCH))));
            return;
        }
        const result = Engine.step(game.level, game.state, direction);
        if (result.blocked) {
            note('blocked', { dir: direction, input, reason: result.blocked });
            saveProgress();
            if (record.gameId) scheduleSync();
            shake();
            setHint(result.blocked === 'edge' ? 'Labürint ei mahu sinna.' : 'Jõuluvana ei saa lauast välja lükata.');
            return;
        }
        game.history.push(game.state);
        game.state = result.state;
        game.moves += direction;
        record.actions++;
        note('move', { dir: direction, input });
        setHint('');
        place(true);
        renderStatus();
        if (Engine.solved(game.level, game.state)) {
            note('solve');
            const finished = { moves: game.moves, actions: record.actions };
            end(gameId => api('games/' + gameId + '/finish', Object.assign({}, finished, logPart(FINISH_BATCH))));
        } else {
            saveProgress();
            ensureGame().then(scheduleSync).catch(() => { /* retried on the next move */ });
        }
    }

    /** Takes back the last move; `input` is key or button. */
    function undo(input) {
        if (!game.history.length || game.solved) return;
        const undone = game.moves.slice(-1);
        game.state = game.history.pop();
        game.moves = game.moves.slice(0, -1);
        note('undo', { dir: undone, input });
        place(true);
        saveProgress();
        if (record.gameId) scheduleSync();
        setHint('');
        renderStatus();
    }

    function restart() {
        clearProgress(game.level.id);
        openLevel(game.index, { resume: false, ending: { type: 'restart', input: 'button' } });
    }

    /** Ends the game: `submit(gameId)` records it on the server; its answer fills the win card. */
    function end(submit) {
        game.solved = true;
        game.submitting = true;
        const level = game.level;
        const attempt = record.attempt;
        clearProgress(level.id);
        clearTimeout(record.timer);
        renderStatus();
        const send = () => ensureGame().then(gameId => {
            if (!gameId) throw new Error('Mängu ei õnnestunud alustada.');
            return submit(gameId);
        });
        send().catch(err => {
            // The game was archived meanwhile (scoreboard reset): record this finish as a new game.
            if (err.status !== 404 || attempt !== record.attempt) throw err;
            forgetGame();
            return send();
        }).then(response => {
            if (attempt === record.attempt) record.log = [];   // the finish carried them
            data.results = response.results;
            data.board = response.board;
            const best = data.results[level.id];
            $('winStars').innerHTML = '';
            $('winStars').appendChild(starsHtml(response.attempt.stars, 3));
            $('winText').textContent = moves(response.attempt.moves);
            $('winBest').textContent = response.improved && best
                ? 'Uus isiklik rekord!'
                : best ? 'Sinu parim: ' + moves(best.moves) + '.' : '';
            const last = game.index >= data.levels.length - 1;
            $('nextButton').classList.toggle('hidden', last);
            $('win').classList.remove('hidden');
            renderLevels();
            renderBoard();
            // Show where this game puts the agent: open the scoreboard and bring it into view.
            $('scoreboard').open = true;
            const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            $('scoreboard').closest('header').scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        }).catch(err => {
            setHint('Tulemust ei õnnestunud salvestada: ' + err.message);
            $('win').classList.add('hidden');
        }).finally(() => {
            game.submitting = false;
        });
    }

    // ---- input ---------------------------------------------------------------------------------

    /**
     * Swipe gestures on the board (touch, pen or mouse drag): one swipe is one move. The move fires as
     * soon as the finger has travelled far enough, without waiting for it to lift; the stronger axis
     * decides the direction; a short quick flick counts too. The pointer is captured, so a swipe that
     * starts on the board still counts after the finger slides off it.
     */
    function bindSwipe(target) {
        const DISTANCE = 28;          // px of travel that makes a swipe
        const FLICK_DISTANCE = 12;    // a shorter flick counts when it is quick
        const FLICK_MS = 180;
        const direction = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
        let swipe = null;
        target.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), moved: false, input: event.pointerType || 'touch' };
            try { target.setPointerCapture(event.pointerId); } catch (e) { /* not supported */ }
        });
        target.addEventListener('pointermove', event => {
            if (!swipe || swipe.moved || event.pointerId !== swipe.id) return;
            const dx = event.clientX - swipe.x;
            const dy = event.clientY - swipe.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) >= DISTANCE) {
                swipe.moved = true;
                move(direction(dx, dy), swipe.input);
            }
        });
        const end = event => {
            if (!swipe || event.pointerId !== swipe.id) return;
            const done = swipe;
            swipe = null;
            if (done.moved || event.type === 'pointercancel') return;
            const dx = event.clientX - done.x;
            const dy = event.clientY - done.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) >= FLICK_DISTANCE && performance.now() - done.t <= FLICK_MS) {
                move(direction(dx, dy), done.input);
            }
        };
        target.addEventListener('pointerup', end);
        target.addEventListener('pointercancel', end);
    }

    const KEYS = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R' };

    // ---- showing and hiding (index.js swaps this section in for the dossier) ---------------------

    let started = false;
    let visible = false;

    function start() {
        started = true;
        bindSwipe($('board'));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (visible) leave('tab');
                syncNow({ keepalive: true });
            } else if (visible) {
                comeBack('tab');
            }
        });
        window.addEventListener('pagehide', () => syncNow({ keepalive: true }));
        $('undoButton').addEventListener('click', () => undo('button'));
        $('restartButton').addEventListener('click', restart);
        $('retryButton').addEventListener('click', restart);
        $('nextButton').addEventListener('click', () => openLevel(Math.min(game.index + 1, data.levels.length - 1)));
        $('levels').addEventListener('click', event => {
            const tab = event.target.closest('.level-tab');
            if (tab) openLevel(Number(tab.dataset.index));
        });
        document.addEventListener('keydown', event => {
            // The dossier page has its own keys (the code field): only steer while the maze is showing.
            if (!visible || event.metaKey || event.ctrlKey || event.altKey) return;
            const direction = KEYS[event.key];
            if (direction) {
                event.preventDefault();
                move(direction, 'key');
            } else if (event.key === 'z' || event.key === 'Backspace') {
                undo('key');
            }
        });

        api('state').then(state => {
            data.levels = state.levels;
            data.results = state.results;
            data.board = state.board;
            // Start at the first level not yet finished.
            const firstOpen = data.levels.findIndex(level => !data.results[level.id]);
            openLevel(firstOpen === -1 ? 0 : firstOpen);
            renderBoard();
        }).catch(err => setHint(err.message));
    }

    /** Refreshes the scoreboard when the maze is opened again; the game itself carries on where it was. */
    function refresh() {
        api('state').then(state => {
            data.results = state.results;
            data.board = state.board;
            renderLevels();
            renderBoard();
        }).catch(() => { /* the scoreboard from last time stays */ });
    }

    /** Logs the agent leaving a game under way: `reason` is tab (the page was hidden) or view (back to the dossier). */
    function leave(reason) {
        if (record.away || !playing()) return;
        note('away', { reason });
        record.away = true;
        saveProgress();
    }

    function comeBack(reason) {
        if (!record.away) return;
        record.away = false;
        note('back', { reason });
        saveProgress();
    }

    window.MazeView = {
        show() {
            visible = true;
            if (typeof trackEvent === 'function') trackEvent('maze_open');
            if (started) {
                comeBack('view');
                refresh();
            } else {
                start();
            }
        },
        /** Called when the dossier comes back: saves the current game's progress straight away. */
        hide() {
            leave('view');
            visible = false;
            syncNow({ keepalive: true });
        },
    };
})();
