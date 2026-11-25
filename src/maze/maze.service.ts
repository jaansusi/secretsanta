import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { User } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { MazeGame } from './entities/maze-game.entity';
import { MazeGameEvent } from './entities/maze-game-event.entity';
import { MazeEventRow, readEvents, steeringInput } from './maze-events';
import { MazeEngine } from './maze-engine';
import { LEVELS, Level, levelById } from './levels';
import { rankBoard, summarizeGames, GameRow } from './maze-board';

/** Longest move string accepted: far beyond any sensible game, small enough to replay instantly. */
const MAX_MOVES = 2000;
/** Upper bound for the "moves made including undone ones" counter. */
const MAX_ACTIONS = 100_000;
/**
 * Hidden cheat: swiping (or pressing) up, up, down, down, left, right, left, right finishes the game
 * with CHEAT_MOVES moves. Nothing in the participant UI mentions it; the admin panel flags such games.
 */
const CHEAT_CODE = 'UUDDLRLR';
const CHEAT_MOVES = 67;

/** The event log part of a save, as the browser sends it: events, and its clock at sending time. */
export interface EventLog {
    events?: unknown;
    now?: unknown;
}

export interface LevelResult {
    moves: number;
    par: number;
    stars: number;
}

/** Extra per-agent numbers that only the admin panel shows. */
export interface BoardDetails {
    /** Games this agent finished with the cheat code. */
    cheats: number;
    stars: number;
    /** Total time of the best games: the tiebreaker for equal moves. */
    durationMs: number;
    games: number;
    finished: number;
}

export interface BoardView {
    levelCount: number;
    /**
     * Agents who have finished at least one level, ranked. Participants get rank, agent name and moves
     * only: `name` is the agent name for them, and the real name (with `agentName` beside it) for the admin.
     */
    rows: ({ rank: number; name: string; agentName?: string; levelsDone: number; totalMoves: number; me: boolean; first: boolean } & Partial<BoardDetails>)[];
    /** Agents who have played but not finished anything yet (counts for the admin panel only). */
    unfinished: { name: string; agentName?: string; me: boolean; games?: number; latestMoves?: number | null }[];
}

@Injectable()
export class MazeService {
    constructor(
        @InjectModel(MazeGame)
        private readonly games: typeof MazeGame,
        @InjectModel(MazeGameEvent)
        private readonly events: typeof MazeGameEvent,
        @InjectModel(User)
        private readonly users: typeof User,
        private readonly userService: UserService,
    ) { }

    /** Level data for the page: the definition the browser plays, plus the target move count. */
    public levels() {
        return LEVELS.map(level => ({ ...level.definition, par: level.par }));
    }

    /** Starts a game (called on the agent's first move). Earlier unfinished games stay recorded as they are. */
    public async start(userId: number, levelId: unknown): Promise<{ gameId: number }> {
        const level = this.requireLevel(levelId);
        const game = await this.games.create({ userId, level: level.definition.id, moves: '', moveCount: 0, actions: 0, status: 'playing', startedAt: new Date() });
        return { gameId: game.id };
    }

    /**
     * Saves the current path of an unfinished game, and appends the events that came with it (a "restart"
     * event ends the game as restarted). The path must be playable and not yet at the door.
     */
    public async progress(userId: number, gameId: number, moves: unknown, actions: unknown, log: EventLog = {}): Promise<{ ok: true }> {
        const game = await this.requireGame(userId, gameId);
        const level = this.requireLevel(game.level);
        const path = readMoves(moves, true);
        const replay = MazeEngine.replay(level.parsed, path);
        if (replay.moves !== path.length || replay.ok) {
            // Not playable, or already at the door: finishing goes through finish().
            throw new BadRequestException('Vigased käigud.');
        }
        const events = readEvents(log.events, log.now, Date.now());
        await this.save(game, events, {
            moves: path,
            moveCount: path.length,
            actions: readActions(actions, game.actions, path.length),
            ...(events.some(event => event.type === 'restart') ? { endReason: 'restarted' } : {}),
        });
        return { ok: true };
    }

    /** Finishes a game after replaying its moves; returns this game's result and whether it beat the agent's best. */
    public async finish(userId: number, gameId: number, moves: unknown, actions: unknown, log: EventLog = {}) {
        const game = await this.requireGame(userId, gameId);
        const level = this.requireLevel(game.level);
        const path = readMoves(moves, false);
        if (!MazeEngine.replay(level.parsed, path).ok) {
            throw new BadRequestException('See lahendus ei vii jõuluvana korstnasse.');
        }
        const previousBest = (await this.myResults(userId))[level.definition.id];
        const finishedAt = new Date();
        await this.save(game, readEvents(log.events, log.now, finishedAt.getTime()), {
            moves: path,
            moveCount: path.length,
            actions: readActions(actions, game.actions, path.length),
            status: 'finished',
            finishedAt,
            durationMs: finishedAt.getTime() - new Date(game.startedAt).getTime(),
            endReason: 'solved',
        });
        const attempt: LevelResult = { moves: path.length, par: level.par, stars: MazeEngine.stars(path.length, level.par) };
        return { attempt, improved: !previousBest || path.length < previousBest.moves };
    }

    /**
     * Finishes a game through the hidden cheat code: recorded as finished with CHEAT_MOVES moves
     * (timed like any game) and flagged `cheat`. `moves` keeps the path the agent had actually made, and
     * the events say what happened up to the code. Returns the same shape as finish().
     */
    public async cheat(userId: number, gameId: number, code: unknown, log: EventLog = {}) {
        if (code !== CHEAT_CODE) {
            throw new BadRequestException('Vigane päring.');
        }
        const game = await this.requireGame(userId, gameId);
        const level = this.requireLevel(game.level);
        const previousBest = (await this.myResults(userId))[level.definition.id];
        const finishedAt = new Date();
        await this.save(game, readEvents(log.events, log.now, finishedAt.getTime()), {
            moveCount: CHEAT_MOVES,
            actions: Math.max(game.actions, CHEAT_MOVES),
            status: 'finished',
            finishedAt,
            durationMs: finishedAt.getTime() - new Date(game.startedAt).getTime(),
            cheat: true,
            endReason: 'cheat',
        });
        const attempt: LevelResult = { moves: CHEAT_MOVES, par: level.par, stars: MazeEngine.stars(CHEAT_MOVES, level.par) };
        return { attempt, improved: !previousBest || CHEAT_MOVES < previousBest.moves };
    }

    /** The agent's best finished result per level id. */
    public async myResults(userId: number): Promise<Record<number, LevelResult>> {
        const finished = await this.games.findAll({ where: { userId, status: 'finished', archivedAt: null }, attributes: ['level', 'moveCount'] });
        const out: Record<number, LevelResult> = {};
        for (const game of finished) {
            const level = levelById(game.level);
            if (!level || (out[game.level] && out[game.level].moves <= game.moveCount)) continue;
            out[game.level] = { moves: game.moveCount, par: level.par, stars: MazeEngine.stars(game.moveCount, level.par) };
        }
        return out;
    }

    /**
     * One group's scoreboard. Participants see rank, agent name and best moves, never real names;
     * `detailed` (admin panel only) shows real names with agent names beside them, and adds stars, games
     * played and finished, and the progress of agents who have not finished yet.
     */
    public async board(groupId: number, viewerId: number | null, { detailed = false } = {}): Promise<BoardView> {
        const rows = await this.games.findAll({
            where: { userId: await this.memberIds(groupId), archivedAt: null },
            attributes: ['userId', 'level', 'status', 'moveCount', 'startedAt', 'finishedAt', 'durationMs', 'cheat', 'updatedAt'],
        });
        const { best, stats } = summarizeGames(rows.map(toGameRow), starsFor);
        const ranked = rankBoard(best, LEVELS.length);
        const [realNames, agentNames] = await Promise.all([
            detailed ? this.names([...stats.keys()]) : new Map<number, string>(),
            this.userService.agentNames(groupId),
        ]);
        const who = (userId: number) => ({
            name: (detailed ? realNames : agentNames).get(userId) || '?',
            ...(detailed ? { agentName: agentNames.get(userId) ?? '' } : {}),
        });
        const ranks = new Set(ranked.rows.map(row => row.userId));
        return {
            levelCount: LEVELS.length,
            rows: ranked.rows.map(row => ({
                rank: row.rank,
                ...who(row.userId),
                levelsDone: row.levelsDone,
                totalMoves: row.totalMoves,
                me: row.userId === viewerId,
                first: row.userId === ranked.firstFinisherId,
                ...(detailed ? {
                    cheats: stats.get(row.userId)?.cheats ?? 0,
                    stars: row.stars,
                    durationMs: row.totalDurationMs,
                    games: stats.get(row.userId)?.games ?? 0,
                    finished: stats.get(row.userId)?.finished ?? 0,
                } : {}),
            })),
            unfinished: [...stats]
                .filter(([userId]) => !ranks.has(userId))
                .sort(([, a], [, b]) => b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime())
                .map(([userId, s]) => ({
                    ...who(userId),
                    me: userId === viewerId,
                    ...(detailed ? { games: s.games, latestMoves: s.latestUnfinishedMoves } : {}),
                })),
        };
    }

    /** Admin: one group's totals and most recent games (with each finished game's time). Archived games only as a count. */
    public async adminSummary(groupId: number) {
        const userId = await this.memberIds(groupId);
        const [games, finished, players, recent, archived] = await Promise.all([
            this.games.count({ where: { userId, archivedAt: null } }),
            this.games.count({ where: { userId, status: 'finished', archivedAt: null } }),
            this.games.count({ where: { userId, archivedAt: null }, distinct: true, col: 'userId' }),
            this.games.findAll({ where: { userId, archivedAt: null }, order: [['updatedAt', 'DESC']], limit: 15, include: [{ model: User, attributes: ['name'] }] }),
            this.games.count({ where: { userId, archivedAt: { [Op.ne]: null } } }),
        ]);
        return {
            games,
            finished,
            unfinished: games - finished,
            players,
            archived,
            recent: recent.map(game => ({
                id: game.id,
                name: game.user?.name ?? '?',
                level: levelById(game.level)?.definition.name ?? `#${game.level}`,
                status: game.status,
                moves: game.moveCount,
                actions: game.actions,
                startedAt: game.startedAt,
                updatedAt: game.updatedAt,
                finishedAt: game.finishedAt,
                durationMs: game.durationMs,
                cheat: game.cheat,
                endReason: game.endReason,
                input: game.input,
            })),
        };
    }

    /**
     * Admin: every maze game of one group, archived ones too, each with its full event log, plus the
     * levels and the group's participants: the raw material for a report. Holds no gift data.
     */
    public async exportData(groupId: number) {
        const agentNames = await this.userService.agentNames(groupId);
        const participants = await this.users.findAll({ where: { groupId }, attributes: ['id', 'name', 'isAdmin'], order: [['name', 'ASC']] });
        const names = new Map(participants.map(user => [user.id, user.name]));
        const games = await this.games.findAll({ where: { userId: participants.map(user => user.id) }, order: [['startedAt', 'ASC'], ['id', 'ASC']] });
        const events = games.length
            ? await this.events.findAll({ where: { gameId: games.map(game => game.id) }, order: [['gameId', 'ASC'], ['seq', 'ASC']], raw: true })
            : [];
        const byGame = new Map<number, MazeGameEvent[]>();
        for (const event of events) {
            byGame.set(event.gameId, [...(byGame.get(event.gameId) ?? []), event]);
        }
        return {
            levels: LEVELS.map(level => ({ ...level.definition, par: level.par })),
            participants: participants.map(user => ({ id: user.id, name: user.name, agentName: agentNames.get(user.id) ?? '', isAdmin: user.isAdmin })),
            games: games.map(game => {
                const level = levelById(game.level);
                const finished = game.status === 'finished';
                return {
                    id: game.id,
                    userId: game.userId,
                    name: names.get(game.userId) ?? '?',
                    agentName: agentNames.get(game.userId) ?? '',
                    level: game.level,
                    status: game.status,
                    endReason: game.endReason,
                    cheat: game.cheat,
                    archivedAt: game.archivedAt,
                    input: game.input,
                    moves: game.moves,
                    moveCount: game.moveCount,
                    actions: game.actions,
                    /** Moves taken back: every move made minus the ones still on the path. Not meaningful for cheat games. */
                    undos: game.cheat ? null : game.actions - game.moveCount,
                    par: level?.par ?? null,
                    stars: finished && level ? MazeEngine.stars(game.moveCount, level.par) : null,
                    startedAt: game.startedAt,
                    finishedAt: game.finishedAt,
                    durationMs: game.durationMs,
                    lastActivityAt: game.updatedAt,
                    events: (byGame.get(game.id) ?? []).map(event => ({
                        seq: event.seq,
                        type: event.type,
                        dir: event.dir,
                        input: event.input,
                        reason: event.reason,
                        ball: event.ballX === null ? null : [event.ballX, event.ballY],
                        maze: event.mazeX === null ? null : [event.mazeX, event.mazeY],
                        at: event.at,
                    })),
                };
            }),
        };
    }

    /**
     * Admin: clears one group's scoreboard, e.g. after testing. The games are archived, not deleted: they
     * stop counting anywhere but stay in the data download. Returns how many were archived.
     */
    public async reset(groupId: number): Promise<number> {
        const [archived] = await this.games.update({ archivedAt: new Date() }, { where: { userId: await this.memberIds(groupId), archivedAt: null } });
        return archived;
    }

    /**
     * Updates the game and appends its new events in one transaction. Events already stored (a save sent
     * twice, e.g. once more as the page closed) are skipped by their number.
     */
    private async save(game: MazeGame, events: MazeEventRow[], changes: Partial<MazeGame>): Promise<void> {
        await this.games.sequelize!.transaction(async transaction => {
            if (events.length) {
                await this.events.bulkCreate(events.map(event => ({ ...event, gameId: game.id })), { ignoreDuplicates: true, transaction });
            }
            const input = steeringInput(game.input, events);
            await game.update({ ...changes, ...(input !== game.input ? { input } : {}) }, { transaction });
        });
    }

    private async memberIds(groupId: number): Promise<number[]> {
        return (await this.users.findAll({ where: { groupId }, attributes: ['id'] })).map(user => user.id);
    }

    private requireLevel(levelId: unknown): Level {
        const level = typeof levelId === 'number' ? levelById(levelId) : undefined;
        if (!level) {
            throw new BadRequestException('Tundmatu tase.');
        }
        return level;
    }

    private async requireGame(userId: number, gameId: number): Promise<MazeGame> {
        const game = await this.games.findByPk(gameId);
        // An archived game is gone as far as the player is concerned: their next move starts a new one.
        if (!game || game.userId !== userId || game.archivedAt) {
            throw new NotFoundException('Mängu ei leitud.');
        }
        if (game.status === 'finished') {
            throw new ConflictException('See mäng on juba lõpetatud.');
        }
        return game;
    }

    private async names(ids: number[]): Promise<Map<number, string>> {
        if (!ids.length) return new Map();
        const users = await this.users.findAll({ where: { id: ids }, attributes: ['id', 'name'] });
        return new Map(users.map(user => [user.id, user.name]));
    }
}

function toGameRow(game: MazeGame): GameRow {
    return {
        userId: game.userId,
        level: game.level,
        status: game.status,
        moveCount: game.moveCount,
        startedAt: game.startedAt,
        finishedAt: game.finishedAt,
        durationMs: game.durationMs,
        cheat: game.cheat,
        updatedAt: game.updatedAt,
    };
}

function starsFor(levelId: number, moves: number): number | null {
    const level = levelById(levelId);
    return level ? MazeEngine.stars(moves, level.par) : null;
}

function readMoves(moves: unknown, allowEmpty: boolean): string {
    if (typeof moves !== 'string' || moves.length > MAX_MOVES || !(allowEmpty ? /^[UDLR]*$/ : /^[UDLR]+$/).test(moves)) {
        throw new BadRequestException('Vigased käigud.');
    }
    return moves;
}

/** The client's count of all moves made; never below what is stored or the current path length. */
function readActions(actions: unknown, stored: number, pathLength: number): number {
    const value = typeof actions === 'number' && Number.isSafeInteger(actions) ? Math.min(Math.max(actions, 0), MAX_ACTIONS) : 0;
    return Math.max(value, stored, pathLength);
}
