import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * Columns added to maze_game after it was first created (Sequelize's sync never adds columns to an
 * existing table). Idempotent; runs before sync on every start. A new database gets them from sync.
 */
export async function migrateMaze(sequelize: Sequelize): Promise<void> {
    const [table] = await sequelize.query<{ exists: boolean }>(`SELECT to_regclass('maze_game') IS NOT NULL AS exists`, { type: QueryTypes.SELECT });
    if (!table?.exists) return;
    await sequelize.query('ALTER TABLE maze_game ADD COLUMN IF NOT EXISTS "endReason" VARCHAR(16)');
    await sequelize.query('ALTER TABLE maze_game ADD COLUMN IF NOT EXISTS "input" VARCHAR(8)');
    await sequelize.query('ALTER TABLE maze_game ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE');
    // Games finished before endReason existed.
    await sequelize.query(`UPDATE maze_game SET "endReason" = CASE WHEN cheat THEN 'cheat' ELSE 'solved' END WHERE status = 'finished' AND "endReason" IS NULL`);
}
