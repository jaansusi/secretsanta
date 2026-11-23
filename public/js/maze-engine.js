/*
 * Rules of the maze minigame, shared by the browser (window.MazeEngine) and the server (require), so a
 * submitted solution is replayed with exactly the rules the player saw.
 *
 * The world is a fixed grid of cells. The maze is a rigid set of walls inside its own w x h box,
 * placed at an offset in the world. The player moves the MAZE one cell at a time, never the ball:
 *   - the maze must stay inside the world;
 *   - a wall that moves into the ball's cell pushes the ball along (the ball must stay in the world);
 *   - walls moving away from, or alongside, the ball leave it where it is.
 * The level is solved when the ball sits on the door cell. There is no way to lose.
 *
 * Coordinates: x grows to the right, y grows downwards. A move is one of "U", "D", "L", "R".
 *
 * Level text format (the maze box only): (2h + 1) lines of (2w + 1) characters. Cells sit at odd
 * positions; the characters between them are walls: "|" for a vertical wall, "-" for a horizontal one,
 * anything else (space, ".", "+") for no wall. Corner positions are ignored.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MazeEngine = api;
}(typeof self !== 'undefined' ? self : this, function () {
    var DIRECTIONS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

    /** Parses a level definition into the shape the other functions use. Throws on a malformed level. */
    function parseLevel(def) {
        var rows = def.maze;
        var h = (rows.length - 1) / 2;
        var w = (rows[0].length - 1) / 2;
        if (!Number.isInteger(h) || !Number.isInteger(w) || h < 1 || w < 1) throw new Error('maze text must be (2h+1) x (2w+1)');
        rows.forEach(function (row) {
            if (row.length !== 2 * w + 1) throw new Error('maze rows must all be ' + (2 * w + 1) + ' characters');
        });
        var vertical = {};   // "x,y": wall on the LEFT edge of local cell (x, y), x in 0..w
        var horizontal = {}; // "x,y": wall on the TOP edge of local cell (x, y), y in 0..h
        for (var y = 0; y < h; y++) {
            for (var x = 0; x <= w; x++) {
                if (rows[2 * y + 1][2 * x] === '|') vertical[x + ',' + y] = true;
            }
        }
        for (var y2 = 0; y2 <= h; y2++) {
            for (var x2 = 0; x2 < w; x2++) {
                if (rows[2 * y2][2 * x2 + 1] === '-') horizontal[x2 + ',' + y2] = true;
            }
        }
        var level = {
            id: def.id,
            name: def.name,
            world: { w: def.world[0], h: def.world[1] },
            box: { w: w, h: h },
            vertical: vertical,
            horizontal: horizontal,
            start: { ox: def.mazeAt[0], oy: def.mazeAt[1], bx: def.ball[0], by: def.ball[1] },
            door: { x: def.door[0], y: def.door[1] },
        };
        var s = level.start;
        if (!insideWorld(level, s.bx, s.by) || !insideWorld(level, level.door.x, level.door.y)) throw new Error('ball and door must be in the world');
        if (s.ox < 0 || s.oy < 0 || s.ox + w > level.world.w || s.oy + h > level.world.h) throw new Error('maze must start inside the world');
        return level;
    }

    function insideWorld(level, x, y) {
        return x >= 0 && y >= 0 && x < level.world.w && y < level.world.h;
    }

    /**
     * Applies one move. Returns { state, pushed } or { blocked: "edge" | "ball" } when the move is not
     * possible (the maze would leave the world, or would push the ball out of it).
     */
    function step(level, state, move) {
        var d = DIRECTIONS[move];
        if (!d) throw new Error('unknown move ' + move);
        var ox = state.ox + d[0];
        var oy = state.oy + d[1];
        if (ox < 0 || oy < 0 || ox + level.box.w > level.world.w || oy + level.box.h > level.world.h) {
            return { blocked: 'edge' };
        }
        // The ball's cell in the maze's own coordinates, before the move.
        var lx = state.bx - state.ox;
        var ly = state.by - state.oy;
        var pushed;
        if (d[0] === 1) pushed = !!level.vertical[lx + ',' + ly];             // wall on its left edge
        else if (d[0] === -1) pushed = !!level.vertical[(lx + 1) + ',' + ly]; // wall on its right edge
        else if (d[1] === 1) pushed = !!level.horizontal[lx + ',' + ly];      // wall on its top edge
        else pushed = !!level.horizontal[lx + ',' + (ly + 1)];                // wall on its bottom edge
        var bx = state.bx + (pushed ? d[0] : 0);
        var by = state.by + (pushed ? d[1] : 0);
        if (!insideWorld(level, bx, by)) return { blocked: 'ball' };
        return { state: { ox: ox, oy: oy, bx: bx, by: by }, pushed: pushed };
    }

    function solved(level, state) {
        return state.bx === level.door.x && state.by === level.door.y;
    }

    /**
     * Replays a move string from the start. Returns { ok, moves, state } where ok means every move was
     * possible and the ball ended on the door (and not before the last move).
     */
    function replay(level, moves) {
        var state = level.start;
        for (var i = 0; i < moves.length; i++) {
            if (solved(level, state)) return { ok: false, reason: 'moves after the ball reached the door', moves: i, state: state };
            var result = step(level, state, moves[i]);
            if (result.blocked) return { ok: false, reason: 'move ' + (i + 1) + ' is not possible', moves: i, state: state };
            state = result.state;
        }
        return { ok: solved(level, state), reason: solved(level, state) ? null : 'the ball is not on the door', moves: moves.length, state: state };
    }

    /** Breadth-first search: the shortest solution as a move string, or null if there is none. */
    function solve(level) {
        var key = function (s) { return s.ox + ',' + s.oy + ',' + s.bx + ',' + s.by; };
        var queue = [level.start];
        var seen = {};
        seen[key(level.start)] = '';
        for (var head = 0; head < queue.length; head++) {
            var state = queue[head];
            var path = seen[key(state)];
            if (solved(level, state)) return path;
            for (var move in DIRECTIONS) {
                var result = step(level, state, move);
                if (result.blocked) continue;
                var k = key(result.state);
                if (seen[k] === undefined) {
                    seen[k] = path + move;
                    queue.push(result.state);
                }
            }
        }
        return null;
    }

    /** 3 stars at the shortest solution, 2 within half again as many moves, 1 for any solution. */
    function stars(moves, par) {
        if (moves <= par) return 3;
        if (moves <= Math.ceil(par * 1.5)) return 2;
        return 1;
    }

    return { DIRECTIONS: DIRECTIONS, parseLevel: parseLevel, step: step, solved: solved, replay: replay, solve: solve, stars: stars };
}));
