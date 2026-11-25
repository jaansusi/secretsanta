import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { MazeGame } from './maze-game.entity';
import type { MazeEventType } from '../maze-events';

/**
 * One thing that happened in a maze game, in order: every move (also ones that hit a wall and were not
 * made), undo, resume, restart, the maze being left and come back to, the cheat code and the solve.
 * Append-only, recorded by the browser and sent with the game's progress saves; a game can be replayed
 * move by move from these rows. Report data only: scores never depend on them.
 */
@Table({
    tableName: 'maze_game_event',
    updatedAt: false,
    indexes: [{ unique: true, fields: ['gameId', 'seq'] }],
})
export class MazeGameEvent extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @ForeignKey(() => MazeGame)
    @Column({ allowNull: false })
    gameId: number;

    @BelongsTo(() => MazeGame, { foreignKey: 'gameId', onDelete: 'CASCADE' })
    game: MazeGame;

    /** Order within the game, from 0; numbered by the browser, so a resent save is not stored twice. */
    @Column({ allowNull: false })
    seq: number;

    /** move | blocked | undo | resume | restart | away | back | cheat | solve */
    @Column({ type: DataType.STRING(16), allowNull: false })
    type: MazeEventType;

    /** U/D/L/R: the move made or tried (move, blocked, cheat) or taken back (undo). */
    @Column({ type: DataType.STRING(1) })
    dir: string | null;

    /** How it was done: touch | mouse | pen (a swipe), key, or button. */
    @Column({ type: DataType.STRING(8) })
    input: string | null;

    /** blocked: edge (the maze would leave the world) or ball (the bauble would leave the board). away/back: tab or view. */
    @Column({ type: DataType.STRING(8) })
    reason: string | null;

    /** Bauble and maze position (world cells) after the event. */
    @Column({ type: DataType.SMALLINT })
    ballX: number | null;

    @Column({ type: DataType.SMALLINT })
    ballY: number | null;

    @Column({ type: DataType.SMALLINT })
    mazeX: number | null;

    @Column({ type: DataType.SMALLINT })
    mazeY: number | null;

    /** When it happened: the browser's clock, shifted onto the server's clock (accurate to network latency). */
    @Column({ type: DataType.DATE, allowNull: false })
    at: Date;

    /** When the server received it. */
    declare createdAt: Date;
}
