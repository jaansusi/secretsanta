/**
 * The maze event log the browser sends with each save (see MazeGameEvent). Parsing is forgiving: an
 * event that does not make sense is dropped, never the save it came with, since the log is report data.
 */
export const MAZE_EVENT_TYPES = ['move', 'blocked', 'undo', 'resume', 'restart', 'away', 'back', 'cheat', 'solve'] as const;
export type MazeEventType = (typeof MAZE_EVENT_TYPES)[number];

/** How a game ended. A game without one is still open, or was left (abandoned). */
export type MazeEndReason = 'solved' | 'cheat' | 'restarted';

/** Most events one save may carry; the browser sends fewer. */
export const MAX_EVENTS_PER_SAVE = 500;
/** Highest event number accepted in one game. */
const MAX_SEQ = 200_000;

const DIRS = new Set(['U', 'D', 'L', 'R']);
const INPUTS = new Set(['touch', 'mouse', 'pen', 'key', 'button']);
const REASONS: Partial<Record<MazeEventType, Set<string>>> = {
    blocked: new Set(['edge', 'ball']),
    away: new Set(['tab', 'view']),
    back: new Set(['tab', 'view']),
};
/** Event types that are a move tried by the agent, so their input says how the game was played. */
const STEERING: MazeEventType[] = ['move', 'blocked'];

export interface MazeEventRow {
    seq: number;
    type: MazeEventType;
    dir: string | null;
    input: string | null;
    reason: string | null;
    ballX: number | null;
    ballY: number | null;
    mazeX: number | null;
    mazeY: number | null;
    at: Date;
}

/**
 * Reads the events of one save. `clientNow` is the browser's clock when it sent them: the difference to
 * `serverNow` moves each event's time onto the server's clock, so times from devices with a wrong clock
 * still line up with startedAt and finishedAt.
 */
export function readEvents(raw: unknown, clientNow: unknown, serverNow: number): MazeEventRow[] {
    if (!Array.isArray(raw)) return [];
    const skew = typeof clientNow === 'number' && Number.isFinite(clientNow) ? serverNow - clientNow : 0;
    const out: MazeEventRow[] = [];
    const seen = new Set<number>();
    for (const event of raw.slice(0, MAX_EVENTS_PER_SAVE)) {
        const row = readEvent(event, skew, serverNow);
        if (row && !seen.has(row.seq)) {
            seen.add(row.seq);
            out.push(row);
        }
    }
    return out;
}

function readEvent(event: unknown, skew: number, serverNow: number): MazeEventRow | null {
    if (!event || typeof event !== 'object') return null;
    const e = event as Record<string, unknown>;
    const type = e.type as MazeEventType;
    if (!MAZE_EVENT_TYPES.includes(type)) return null;
    if (!Number.isSafeInteger(e.seq) || (e.seq as number) < 0 || (e.seq as number) > MAX_SEQ) return null;
    const at = typeof e.at === 'number' && Number.isFinite(e.at) ? Math.min(e.at + skew, serverNow) : serverNow;
    const [ballX, ballY] = readCell(e.ball);
    const [mazeX, mazeY] = readCell(e.maze);
    return {
        seq: e.seq as number,
        type,
        dir: typeof e.dir === 'string' && DIRS.has(e.dir) ? e.dir : null,
        input: typeof e.input === 'string' && INPUTS.has(e.input) ? e.input : null,
        reason: typeof e.reason === 'string' && REASONS[type]?.has(e.reason) ? e.reason : null,
        ballX,
        ballY,
        mazeX,
        mazeY,
        at: new Date(at),
    };
}

function readCell(value: unknown): [number | null, number | null] {
    const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= -100 && (n as number) <= 100;
    return Array.isArray(value) && value.length === 2 && ok(value[0]) && ok(value[1]) ? [value[0], value[1]] : [null, null];
}

/**
 * How a game was steered, kept on the game row: touch, mouse, pen or key, or "mixed" once more than one
 * was used. `current` is what is stored so far.
 */
export function steeringInput(current: string | null, events: MazeEventRow[]): string | null {
    let input = current;
    for (const event of events) {
        if (!STEERING.includes(event.type) || !event.input || event.input === 'button') continue;
        if (input === null) input = event.input;
        else if (input !== event.input) input = 'mixed';
    }
    return input;
}
