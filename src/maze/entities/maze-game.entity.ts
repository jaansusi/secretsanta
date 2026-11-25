import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from 'sequelize-typescript';
import { User } from 'src/user/entities/user.entity';
import type { MazeEndReason } from '../maze-events';
import { MazeGameEvent } from './maze-game-event.entity';

export type MazeGameStatus = 'playing' | 'finished';

/**
 * One played game of a maze level, finished or not. A game starts with the agent's first move and its
 * moves are saved as they play; "Alusta otsast" (restart) begins a new game, and the old one stays here
 * as unfinished. Best results and the scoreboard are computed from these rows.
 */
@Table({
    tableName: 'maze_game',
    indexes: [{ fields: ['userId'] }, { fields: ['level', 'status'] }],
})
export class MazeGame extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @ForeignKey(() => User)
    @Column({ allowNull: false })
    userId: number;

    @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
    user: User;

    /** Level id from levels.ts. */
    @Column({ allowNull: false })
    level: number;

    /** The current path from the start ("UDLR…"), always replayable; undone moves are not in it. */
    @Column({ type: DataType.TEXT, allowNull: false, defaultValue: '' })
    moves: string;

    /** Length of `moves`: the score once finished. */
    @Column({ allowNull: false, defaultValue: 0 })
    moveCount: number;

    /** Every move made in this game, including ones later undone. */
    @Column({ allowNull: false, defaultValue: 0 })
    actions: number;

    @Column({ type: DataType.STRING(16), allowNull: false, defaultValue: 'playing' })
    status: MazeGameStatus;

    @Column({ type: DataType.DATE, allowNull: false })
    startedAt: Date;

    @Column({ type: DataType.DATE })
    finishedAt: Date | null;

    /** Server-measured time from the first move to reaching the door: the tiebreaker for equal moves. */
    @Column({ type: DataType.INTEGER })
    durationMs: number | null;

    /** Finished with the hidden cheat code (see MazeService.cheat) instead of reaching the door. Admin-only. */
    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
    cheat: boolean;

    /**
     * How the game ended: solved, cheat, or restarted ("Alusta otsast" while it was open). Null while it
     * is open, which for a game nobody touches any more means it was abandoned.
     */
    @Column({ type: DataType.STRING(16) })
    endReason: MazeEndReason | null;

    /** How it was steered: touch, mouse, pen, key, or mixed. From the event log; null for games before it. */
    @Column({ type: DataType.STRING(8) })
    input: string | null;

    /**
     * Set by the admin's "Reset scoreboard": the game no longer counts anywhere (scoreboard, best results,
     * totals) and cannot be continued, but is kept, with its events, for the data download.
     */
    @Column({ type: DataType.DATE })
    archivedAt: Date | null;

    /** Everything that happened in the game, in order. */
    @HasMany(() => MazeGameEvent, { foreignKey: 'gameId' })
    events: MazeGameEvent[];

    /** Last saved activity (Sequelize timestamp). */
    declare updatedAt: Date;
}
