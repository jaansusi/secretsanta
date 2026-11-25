import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';

/**
 * Columns added for the maze after their tables were first created (Sequelize's sync never adds columns to an
 * existing table). Idempotent; runs before sync on every start. A new database gets them from sync.
 */
export async function migrateMaze(sequelize: Sequelize): Promise<void> {
    // The scoreboard's agent names live on the participant.
    await sequelize.query('ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "agentName" VARCHAR(60)');
    // Each participant has one codename, the agent name. Codenames typed into dossiers before that are
    // kept: they become the agent name of anyone who has none yet (not if someone in the group has it).
    const [dossier] = await sequelize.query<{ exists: boolean }>(`SELECT to_regclass('dossier') IS NOT NULL AS exists`, { type: QueryTypes.SELECT });
    if (dossier?.exists) {
        await sequelize.query(`
            UPDATE "user" u SET "agentName" = left(trim(d.codename), 60)
            FROM dossier d
            WHERE d."userId" = u.id AND u."agentName" IS NULL AND trim(coalesce(d.codename, '')) <> ''
              AND NOT EXISTS (SELECT 1 FROM "user" o WHERE o."groupId" = u."groupId" AND o.id <> u.id
                              AND lower(o."agentName") = lower(left(trim(d.codename), 60)))`);
    }
    const [table] = await sequelize.query<{ exists: boolean }>(`SELECT to_regclass('maze_game') IS NOT NULL AS exists`, { type: QueryTypes.SELECT });
    if (!table?.exists) return;
    await sequelize.query('ALTER TABLE maze_game ADD COLUMN IF NOT EXISTS "endReason" VARCHAR(16)');
    await sequelize.query('ALTER TABLE maze_game ADD COLUMN IF NOT EXISTS "input" VARCHAR(8)');
    await sequelize.query('ALTER TABLE maze_game ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE');
    // Games finished before endReason existed.
    await sequelize.query(`UPDATE maze_game SET "endReason" = CASE WHEN cheat THEN 'cheat' ELSE 'solved' END WHERE status = 'finished' AND "endReason" IS NULL`);
}
