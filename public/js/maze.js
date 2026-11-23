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
    const record = { attempt: 0, gameId: null, actions: 0, starting: null, timer: null, synced: '' };
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
            if (!response.ok) throw new Error(json.message || 'Midagi läks valesti, proovi uuesti.');
            return json;
        });
    }

    // ---- saved progress (this browser only) ----------------------------------------------------

    const progressKey = id => 'maze-progress-' + id;
    function saveProgress() {
        const value = JSON.stringify({ gameId: record.gameId, moves: game.moves, actions: record.actions });
        try { localStorage.setItem(progressKey(game.level.id), value); } catch (e) { /* no storage */ }
    }
    function clearProgress(id) {
        try { localStorage.removeItem(progressKey(id)); } catch (e) { /* no storage */ }
    }
    /** { gameId, moves, actions } of an unfinished game in this browser (gameId null if never saved). */
    function loadProgress(id) {
        let raw = '';
        try { raw = localStorage.getItem(progressKey(id)) || ''; } catch (e) { return { gameId: null, moves: '', actions: 0 }; }
        try {
            const saved = JSON.parse(raw);
            if (saved && typeof saved.moves === 'string') {
                return { gameId: Number.isInteger(saved.gameId) ? saved.gameId : null, moves: saved.moves, actions: saved.actions | 0 };
            }
        } catch (e) { /* an older plain move string */ }
        return { gameId: null, moves: /^[UDLR]*$/.test(raw) ? raw : '', actions: raw.length };
    }

    // ---- recording games on the server ---------------------------------------------------------

    /** The server id of the current game, creating the game on first use. */
    function ensureGame() {
        if (record.gameId) return Promise.resolve(record.gameId);
        if (record.starting) return record.starting;
        const attempt = record.attempt;
        const levelId = game.level.id;
        record.starting = api('games', { level: levelId }).then(response => {
            // A restart or level switch while this was in flight: that attempt has its own game.
            if (attempt !== record.attempt) return null;
            record.gameId = response.gameId;
            record.starting = null;
            saveProgress();
            return record.gameId;
        }).catch(err => {
            if (attempt === record.attempt) record.starting = null;
            throw err;
        });
        return record.starting;
    }

    /** Saves the current path soon (moves come in bursts; one save covers them). */
    function scheduleSync() {
        clearTimeout(record.timer);
        record.timer = setTimeout(() => syncNow(), 800);
    }

    /** Saves the current path now, if anything changed since the last save. Never interrupts play. */
    function syncNow({ keepalive = false } = {}) {
        clearTimeout(record.timer);
        if (!record.gameId || game.solved) return Promise.resolve();
        const snapshot = { moves: game.moves, actions: record.actions };
        const key = snapshot.moves + '|' + snapshot.actions;
        if (record.synced === key) return Promise.resolve();
        return api('games/' + record.gameId + '/progress', snapshot, { keepalive })
            .then(() => { record.synced = key; })
            .catch(() => { /* the next move or page close tries again */ });
    }

    /** Starts recording a fresh attempt: the previous game (if any) keeps its last saved state. */
    function newAttempt(saved) {
        syncNow();
        record.attempt++;
        record.gameId = saved ? saved.gameId : null;
        record.actions = saved ? Math.max(saved.actions, saved.moves.length) : 0;
        record.starting = null;
        record.synced = '';
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

        // The door: a fixed target cell.
        const door = svg('g', { class: 'door', transform: 'translate(' + level.door.x * C + ' ' + level.door.y * C + ')' }, board);
        svg('path', { d: 'M10 34 V14 a10 10 0 0 1 20 0 V34 Z', class: 'door-leaf' }, door);
        svg('circle', { cx: 25, cy: 24, r: 1.8, class: 'door-knob' }, door);

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

        // The bauble.
        const ball = svg('g', { class: 'ball' }, board);
        const inner = svg('g', { class: 'ball-inner' }, ball);
        svg('rect', { x: -3.5, y: -16.5, width: 7, height: 5, rx: 1, class: 'ball-cap' }, inner);
        svg('circle', { cx: 0, cy: 0, r: 13, class: 'ball-body' }, inner);
        svg('ellipse', { cx: -4.5, cy: -5, rx: 3.6, ry: 2.4, class: 'ball-shine' }, inner);

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
            who.appendChild(document.createTextNode(row.name + (row.me ? ' (sina)' : '')));
            if (row.first) {
                const badge = el('span', 'badge-first', 'esimesena läbi');
                badge.title = 'Läbis esimesena kõik tasemed';
                who.appendChild(badge);
            }
            item.appendChild(who);
            item.appendChild(el('span', 'score', (board.levelCount > 1 ? row.levelsDone + '/' + board.levelCount + ' · ' : '') + moves(row.totalMoves)));
            list.appendChild(item);
        });
        $('boardEmpty').classList.toggle('hidden', board.rows.length > 0 || board.unfinished.length > 0);

        // Agents who have played but not reached the door yet.
        const pending = $('unfinishedList');
        pending.innerHTML = '';
        board.unfinished.forEach(player => {
            const item = el('li', player.me ? 'me' : '');
            item.appendChild(el('span', 'who', player.name + (player.me ? ' (sina)' : '')));
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

    function openLevel(index, { resume = true } = {}) {
        const def = data.levels[index];
        const saved = resume ? loadProgress(def.id) : null;
        newAttempt(saved && saved.moves ? saved : null);
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
    }

    function move(direction) {
        if (game.solved || game.submitting) return;
        // Every swipe counts here, including impossible ones: the sequence is rarely a playable path.
        game.inputs = (game.inputs + direction).slice(-SECRET.length);
        if (game.inputs === SECRET) {
            end(gameId => api('games/' + gameId + '/cheat', { code: SECRET }));
            return;
        }
        const result = Engine.step(game.level, game.state, direction);
        if (result.blocked) {
            shake();
            setHint(result.blocked === 'edge' ? 'Labürint ei mahu sinna.' : 'Kera ei saa lauast välja lükata.');
            return;
        }
        game.history.push(game.state);
        game.state = result.state;
        game.moves += direction;
        record.actions++;
        setHint('');
        place(true);
        renderStatus();
        if (Engine.solved(game.level, game.state)) {
            const finished = { moves: game.moves, actions: record.actions };
            end(gameId => api('games/' + gameId + '/finish', finished));
        } else {
            saveProgress();
            ensureGame().then(scheduleSync).catch(() => { /* retried on the next move */ });
        }
    }

    function undo() {
        if (!game.history.length || game.solved) return;
        game.state = game.history.pop();
        game.moves = game.moves.slice(0, -1);
        place(true);
        saveProgress();
        if (record.gameId) scheduleSync();
        setHint('');
        renderStatus();
    }

    function restart() {
        clearProgress(game.level.id);
        openLevel(game.index, { resume: false });
    }

    /** Ends the game: `submit(gameId)` records it on the server; its answer fills the win card. */
    function end(submit) {
        game.solved = true;
        game.submitting = true;
        const level = game.level;
        clearProgress(level.id);
        clearTimeout(record.timer);
        renderStatus();
        ensureGame().then(gameId => {
            if (!gameId) throw new Error('Mängu ei õnnestunud alustada.');
            return submit(gameId);
        }).then(response => {
            data.results = response.results;
            data.board = response.board;
            const best = data.results[level.id];
            $('winStars').innerHTML = '';
            $('winStars').appendChild(starsHtml(response.attempt.stars, 3));
            $('winText').textContent = moves(response.attempt.moves) + '.'
                + (response.attempt.stars === 3 ? ' Täiuslik!' : ' Lühem tee on olemas.');
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
            swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now(), moved: false };
            try { target.setPointerCapture(event.pointerId); } catch (e) { /* not supported */ }
        });
        target.addEventListener('pointermove', event => {
            if (!swipe || swipe.moved || event.pointerId !== swipe.id) return;
            const dx = event.clientX - swipe.x;
            const dy = event.clientY - swipe.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) >= DISTANCE) {
                swipe.moved = true;
                move(direction(dx, dy));
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
                move(direction(dx, dy));
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
            if (document.visibilityState === 'hidden') syncNow({ keepalive: true });
        });
        window.addEventListener('pagehide', () => syncNow({ keepalive: true }));
        $('undoButton').addEventListener('click', undo);
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
                move(direction);
            } else if (event.key === 'z' || event.key === 'Backspace') {
                undo();
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

    window.MazeView = {
        show() {
            visible = true;
            if (started) refresh(); else start();
        },
        /** Called when the dossier comes back: saves the current game's progress straight away. */
        hide() {
            visible = false;
            syncNow({ keepalive: true });
        },
    };
})();
