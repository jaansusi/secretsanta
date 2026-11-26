/** One agent's best result on one level. */
export interface BestResult {
    userId: number;
    level: number;
    moves: number;
    stars: number;
    /** Time the best game took (first move to the door). */
    durationMs: number;
    /** When this best result was achieved. */
    completedAt: Date;
    /** When the level was first finished at all; never moves, so it can decide "first to finish". */
    firstCompletedAt: Date;
}

export interface BoardRow {
    rank: number;
    userId: number;
    levelsDone: number;
    totalMoves: number;
    /** Sum of the times of the agent's best games: the tiebreaker for equal moves. */
    totalDurationMs: number;
    stars: number;
    /** When the agent reached their current standing (the latest of their best results). */
    reachedAt: Date;
    /** When the agent first had every level finished, or null. */
    finishedAllAt: Date | null;
}

/**
 * Leaderboard: more levels finished first, then fewer moves in total, then less time in total, then
 * whoever got there first. Results with equal moves and equal time share a rank. `firstFinisherId` is whoever
 * finished every level first (null until someone has).
 */
export function rankBoard(results: BestResult[], levelCount: number): { rows: BoardRow[]; firstFinisherId: number | null } {
    const byUser = new Map<number, BestResult[]>();
    for (const result of results) {
        byUser.set(result.userId, [...(byUser.get(result.userId) ?? []), result]);
    }
    const rows: BoardRow[] = [...byUser].map(([userId, list]) => ({
        rank: 0,
        userId,
        levelsDone: list.length,
        totalMoves: list.reduce((sum, r) => sum + r.moves, 0),
        totalDurationMs: list.reduce((sum, r) => sum + r.durationMs, 0),
        stars: list.reduce((sum, r) => sum + r.stars, 0),
        reachedAt: new Date(Math.max(...list.map(r => r.completedAt.getTime()))),
        finishedAllAt: list.length >= levelCount ? new Date(Math.max(...list.map(r => r.firstCompletedAt.getTime()))) : null,
    }));
    rows.sort((a, b) => b.levelsDone - a.levelsDone || a.totalMoves - b.totalMoves
        || a.totalDurationMs - b.totalDurationMs || a.reachedAt.getTime() - b.reachedAt.getTime());
    rows.forEach((row, index) => {
        const previous = rows[index - 1];
        const tied = previous && previous.levelsDone === row.levelsDone && previous.totalMoves === row.totalMoves
            && previous.totalDurationMs === row.totalDurationMs;
        row.rank = tied ? previous.rank : index + 1;
    });
    const first = rows
        .filter(row => row.finishedAllAt !== null)
        .sort((a, b) => a.finishedAllAt!.getTime() - b.finishedAllAt!.getTime())[0];
    return { rows, firstFinisherId: first?.userId ?? null };
}

/**
 * The agents whose place was decided by time: someone else finished as many levels in as many moves.
 * Only for them does the participants' scoreboard show the time, to explain the order.
 */
export function tiedOnMoves(rows: Pick<BoardRow, 'userId' | 'levelsDone' | 'totalMoves'>[]): Set<number> {
    const key = (row: Pick<BoardRow, 'levelsDone' | 'totalMoves'>) => row.levelsDone + ':' + row.totalMoves;
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
    return new Set(rows.filter(row => counts.get(key(row))! > 1).map(row => row.userId));
}

/** The fields of a played game (maze_game row) that the scoreboard needs. */
export interface GameRow {
    userId: number;
    level: number;
    status: 'playing' | 'finished';
    moveCount: number;
    startedAt: Date;
    finishedAt: Date | null;
    /** Recorded at finish; older rows fall back to finishedAt - startedAt. */
    durationMs: number | null;
    /** Finished with the cheat code. */
    cheat?: boolean;
    updatedAt: Date;
}

export interface PlayerStats {
    games: number;
    finished: number;
    lastPlayedAt: Date;
    /** Moves in the most recently active unfinished game, or null when there is none. */
    latestUnfinishedMoves: number | null;
    /** Games finished with the cheat code. */
    cheats: number;
}

/** How long a finished game took. */
export function gameDuration(game: GameRow): number {
    return game.durationMs ?? Math.max(0, (game.finishedAt?.getTime() ?? 0) - game.startedAt.getTime());
}

/**
 * Turns every played game into each agent's best result per level (fewest moves among finished games,
 * then the fastest, then the earlier one) plus per-agent counts. Games of unknown levels are ignored.
 */
export function summarizeGames(games: GameRow[], starsFor: (level: number, moves: number) => number | null) {
    const best = new Map<string, BestResult>();
    const stats = new Map<number, PlayerStats>();
    const latestUnfinished = new Map<number, GameRow>();
    for (const game of games) {
        if (starsFor(game.level, game.moveCount) === null) continue;
        const s = stats.get(game.userId) ?? { games: 0, finished: 0, lastPlayedAt: game.updatedAt, latestUnfinishedMoves: null, cheats: 0 };
        s.games++;
        if (game.updatedAt > s.lastPlayedAt) s.lastPlayedAt = game.updatedAt;
        stats.set(game.userId, s);
        if (game.status !== 'finished' || !game.finishedAt) {
            const current = latestUnfinished.get(game.userId);
            if (!current || game.updatedAt > current.updatedAt) latestUnfinished.set(game.userId, game);
            continue;
        }
        s.finished++;
        if (game.cheat) s.cheats++;
        const key = game.userId + ':' + game.level;
        const existing = best.get(key);
        const firstCompletedAt = existing && existing.firstCompletedAt < game.finishedAt ? existing.firstCompletedAt : game.finishedAt;
        const duration = gameDuration(game);
        const better = !existing || game.moveCount < existing.moves
            || (game.moveCount === existing.moves && (duration < existing.durationMs
                || (duration === existing.durationMs && game.finishedAt < existing.completedAt)));
        best.set(key, better
            ? { userId: game.userId, level: game.level, moves: game.moveCount, stars: starsFor(game.level, game.moveCount)!, durationMs: duration, completedAt: game.finishedAt, firstCompletedAt }
            : { ...existing!, firstCompletedAt });
    }
    for (const [userId, game] of latestUnfinished) {
        stats.get(userId)!.latestUnfinishedMoves = game.moveCount;
    }
    return { best: [...best.values()], stats };
}
