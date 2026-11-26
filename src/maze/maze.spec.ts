import { MazeEngine, LevelDefinition } from './maze-engine';
import { LEVELS } from './levels';
import { rankBoard, BestResult, summarizeGames, tiedOnMoves, GameRow } from './maze-board';
import { MAX_EVENTS_PER_SAVE, readEvents, steeringInput } from './maze-events';

// A 3x3 box in a 5x5 world: one wall on the right edge of the middle cell, one on the bottom edge of
// the top-middle cell.
const small: LevelDefinition = {
    id: 99,
    name: 'test',
    world: [5, 5],
    mazeAt: [1, 1],
    ball: [2, 2],
    door: [4, 2],
    maze: [
        '+-+-+-+',
        '|     |',
        '+ +-+ +',
        '|   | |',
        '+ + + +',
        '|     |',
        '+-+-+-+',
    ],
};

describe('maze engine', () => {
    const level = MazeEngine.parseLevel(small);

    it('moves the maze and leaves the ball when no wall touches it', () => {
        expect(MazeEngine.step(level, level.start, 'R')).toEqual({ state: { ox: 2, oy: 1, bx: 2, by: 2 }, pushed: false });
    });

    it('pushes the ball with a wall moving into its cell', () => {
        // Moving left: the wall on the ball's right edge moves into it.
        expect(MazeEngine.step(level, level.start, 'L')).toEqual({ state: { ox: 0, oy: 1, bx: 1, by: 2 }, pushed: true });
        // Moving down: the wall on the ball's top edge moves into it.
        expect(MazeEngine.step(level, level.start, 'D')).toEqual({ state: { ox: 1, oy: 2, bx: 2, by: 3 }, pushed: true });
    });

    it('keeps the maze in the world and the ball on the board', () => {
        const atEdge = { ox: 2, oy: 1, bx: 2, by: 2 };
        expect(MazeEngine.step(level, atEdge, 'R')).toEqual({ blocked: 'edge' });
        // The maze already touches the left edge of the world: it cannot move further left.
        const wallRight: LevelDefinition = { ...small, mazeAt: [0, 1], ball: [0, 2], maze: ['+-+-+-+', '|     |', '+ + + +', '| |   |', '+ + + +', '|     |', '+-+-+-+'] };
        const l2 = MazeEngine.parseLevel(wallRight);
        expect(MazeEngine.step(l2, l2.start, 'L')).toEqual({ blocked: 'edge' });
    });

    it('pushes a ball that sits outside the box when the outer wall comes at it', () => {
        const outside = { ox: 1, oy: 1, bx: 0, by: 2 };
        expect(MazeEngine.step(level, outside, 'L')).toEqual({ blocked: 'ball' });
        const outsideRight = { ox: 0, oy: 1, bx: 3, by: 2 };
        expect(MazeEngine.step(level, outsideRight, 'R')).toEqual({ state: { ox: 1, oy: 1, bx: 4, by: 2 }, pushed: true });
    });

    it('replays only real solutions', () => {
        const solution = MazeEngine.solve(level)!;
        expect(solution).not.toBeNull();
        expect(MazeEngine.replay(level, solution).ok).toBe(true);
        expect(MazeEngine.replay(level, solution.slice(0, -1)).ok).toBe(false);
        expect(MazeEngine.replay(level, solution + 'U').ok).toBe(false);   // moves after reaching the door
    });

    it('rejects malformed levels', () => {
        expect(() => MazeEngine.parseLevel({ ...small, maze: ['+-+', '|'] })).toThrow();
        expect(() => MazeEngine.parseLevel({ ...small, mazeAt: [3, 3] })).toThrow();
    });

    it('gives stars by distance from the shortest solution', () => {
        // 3 at the target, 2 up to ceil(1.5 x target) = 14, 1 beyond that.
        expect([9, 13, 14, 15, 40].map(moves => MazeEngine.stars(moves, 9))).toEqual([3, 2, 2, 1, 1]);
    });
});

describe('shipped levels', () => {
    it('are solvable and start with the door outside the maze box', () => {
        expect(LEVELS.map(level => level.par)).toEqual([44]);
        expect(new Set(LEVELS.map(level => level.definition.id)).size).toBe(LEVELS.length);
        for (const { parsed } of LEVELS) {
            const { ox, oy } = parsed.start;
            const inBox = parsed.door.x >= ox && parsed.door.x < ox + parsed.box.w && parsed.door.y >= oy && parsed.door.y < oy + parsed.box.h;
            expect(inBox).toBe(false);
        }
    });
});

describe('rankBoard', () => {
    const t = (minute: number) => new Date(Date.UTC(2026, 11, 1, 12, minute));
    const r = (userId: number, level: number, moves: number, minute: number, firstMinute = minute, durationMs = 60_000): BestResult =>
        ({ userId, level, moves, stars: 3, durationMs, completedAt: t(minute), firstCompletedAt: t(firstMinute) });

    it('ranks by levels finished, then total moves, then who got there first', () => {
        const { rows } = rankBoard([
            r(1, 1, 5, 1), r(1, 2, 9, 2),             // 2 levels, 14 moves
            r(2, 1, 6, 3), r(2, 2, 9, 4),             // 2 levels, 15 moves
            r(3, 1, 5, 5), r(3, 2, 10, 6), r(3, 3, 13, 7), // 3 levels
            r(4, 1, 5, 8), r(4, 2, 9, 9),             // same as user 1, later
        ], 4);
        expect(rows.map(row => [row.userId, row.rank])).toEqual([[3, 1], [1, 2], [4, 2], [2, 4]]);
    });

    it('breaks a tie in moves by time, and shares the rank only when both are equal', () => {
        const { rows } = rankBoard([
            r(1, 1, 44, 1, 1, 300_000),   // same moves, slower
            r(2, 1, 44, 2, 2, 120_000),   // same moves, faster: ahead although later
            r(3, 1, 44, 3, 3, 120_000),   // same moves and time as user 2: shared rank
            r(4, 1, 50, 0, 0, 10_000),    // more moves: time does not help
        ], 1);
        expect(rows.map(row => [row.userId, row.rank])).toEqual([[2, 1], [3, 1], [1, 3], [4, 4]]);
    });

    it('names the first agent to finish every level, even if others improve later', () => {
        const { firstFinisherId } = rankBoard([
            r(1, 1, 5, 50, 1), r(1, 2, 9, 51, 2),     // finished both by minute 2, improved later
            r(2, 1, 5, 3), r(2, 2, 9, 4),
        ], 2);
        expect(firstFinisherId).toBe(1);
        expect(rankBoard([r(1, 1, 5, 1)], 2).firstFinisherId).toBeNull();
    });
});

describe('summarizeGames', () => {
    const t = (minute: number) => new Date(Date.UTC(2026, 11, 1, 12, minute));
    const g = (userId: number, status: 'playing' | 'finished', moveCount: number, minute: number, level = 1, durationMs: number | null = null): GameRow => ({
        userId, level, status, moveCount, startedAt: t(minute - 1), finishedAt: status === 'finished' ? t(minute) : null, durationMs, updatedAt: t(minute),
    });
    const starsFor = (level: number, moves: number) => (level === 1 ? (moves <= 44 ? 3 : 1) : null);

    it("keeps each agent's best finished game per level and counts every game", () => {
        const { best, stats } = summarizeGames([
            g(1, 'finished', 60, 1),
            g(1, 'playing', 12, 2),
            g(1, 'finished', 50, 3),
            g(1, 'finished', 50, 4),          // same moves, later: not the best
            g(2, 'playing', 7, 5),
            g(2, 'playing', 20, 6),           // latest unfinished game
            g(3, 'finished', 44, 7, 9),       // unknown level: ignored entirely
        ], starsFor);
        // No recorded duration: falls back to finishedAt - startedAt (one minute here).
        expect(best).toEqual([{ userId: 1, level: 1, moves: 50, stars: 1, durationMs: 60_000, completedAt: t(3), firstCompletedAt: t(1) }]);
        expect(stats.get(1)).toEqual({ games: 4, finished: 3, lastPlayedAt: t(4), latestUnfinishedMoves: 12, cheats: 0 });
        expect(stats.get(2)).toEqual({ games: 2, finished: 0, lastPlayedAt: t(6), latestUnfinishedMoves: 20, cheats: 0 });
        expect(stats.has(3)).toBe(false);
    });

    it('counts games finished with the cheat code like any game, and flags them for the admin', () => {
        const cheated = { ...g(1, 'finished', 67, 2), cheat: true };
        const { best, stats } = summarizeGames([g(1, 'finished', 80, 1), cheated], starsFor);
        expect(best[0]).toMatchObject({ moves: 67 });
        expect(stats.get(1)).toMatchObject({ finished: 2, cheats: 1 });
    });

    it('prefers the faster game when two have the same moves', () => {
        const { best } = summarizeGames([g(1, 'finished', 44, 1, 1, 200_000), g(1, 'finished', 44, 5, 1, 90_000), g(1, 'finished', 44, 9, 1, 150_000)], starsFor);
        expect(best[0]).toMatchObject({ moves: 44, durationMs: 90_000, completedAt: t(5), firstCompletedAt: t(1) });
    });

    it('keeps the first finish time when a later game improves the result', () => {
        const { best } = summarizeGames([g(1, 'finished', 70, 1), g(1, 'finished', 44, 9)], starsFor);
        expect(best[0]).toMatchObject({ moves: 44, stars: 3, completedAt: t(9), firstCompletedAt: t(1) });
    });
});

describe('maze event log', () => {
    const now = 1_800_000_000_000;

    it('reads events and moves their times onto the server clock', () => {
        // The browser's clock is 5 s behind the server's.
        const rows = readEvents([
            { seq: 0, type: 'move', dir: 'U', input: 'touch', at: now - 5000 - 1000, ball: [1, 2], maze: [0, 1] },
            { seq: 1, type: 'blocked', dir: 'L', input: 'touch', reason: 'edge', at: now - 5000 - 500 },
        ], now - 5000, now);
        expect(rows).toEqual([
            { seq: 0, type: 'move', dir: 'U', input: 'touch', reason: null, ballX: 1, ballY: 2, mazeX: 0, mazeY: 1, at: new Date(now - 1000) },
            { seq: 1, type: 'blocked', dir: 'L', input: 'touch', reason: 'edge', ballX: null, ballY: null, mazeX: null, mazeY: null, at: new Date(now - 500) },
        ]);
    });

    it('drops events that make no sense instead of failing the save', () => {
        const rows = readEvents([
            { seq: 0, type: 'teleport', at: now },
            { seq: -1, type: 'move', at: now },
            'move',
            { seq: 1, type: 'move', dir: 'X', input: 'telepathy', reason: 'edge', ball: [1], at: now + 99_999 },
            { seq: 1, type: 'undo', at: now },   // same number twice: the first one counts
        ], now, now);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ seq: 1, type: 'move', dir: null, input: null, reason: null, ballX: null, at: new Date(now) });
        expect(readEvents(undefined, undefined, now)).toEqual([]);
        expect(readEvents(Array.from({ length: 900 }, (_, seq) => ({ seq, type: 'move', at: now })), now, now)).toHaveLength(MAX_EVENTS_PER_SAVE);
    });

    it('sums up how a game was steered', () => {
        const rows = (inputs: string[]) => readEvents(inputs.map((input, seq) => ({ seq, type: seq % 2 ? 'blocked' : 'move', input, at: now })), now, now);
        expect(steeringInput(null, rows(['touch', 'touch']))).toBe('touch');
        expect(steeringInput('touch', rows(['key']))).toBe('mixed');
        expect(steeringInput(null, [])).toBeNull();
        // Undo buttons do not say how the bauble was moved.
        expect(steeringInput(null, readEvents([{ seq: 0, type: 'undo', input: 'button', at: now }], now, now))).toBeNull();
    });
});

describe('tiedOnMoves', () => {
    it('picks out the agents whose moves someone else matched', () => {
        const rows = [
            { userId: 1, levelsDone: 1, totalMoves: 44 },
            { userId: 2, levelsDone: 1, totalMoves: 44 },
            { userId: 3, levelsDone: 1, totalMoves: 50 },
            { userId: 4, levelsDone: 2, totalMoves: 50 },   // same moves, more levels: not a tie
        ];
        expect([...tiedOnMoves(rows)].sort()).toEqual([1, 2]);
        expect(tiedOnMoves([{ userId: 1, levelsDone: 1, totalMoves: 44 }]).size).toBe(0);
    });
});
