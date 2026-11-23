import { Logger } from '@nestjs/common';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Group } from 'src/group/entities/group.entity';
import { SETTING_KEYS } from 'src/settings/settings.service';

const logger = new Logger('GroupMigration');

/** Name of the group that a single-group database is moved into. Can be renamed in the admin panel. */
export const DEFAULT_GROUP_NAME = 'Secret Santa';

/**
 * Turns a database from before groups existed into a database with one group, and makes sure there is
 * always at least one group. Runs before Sequelize's sync (which only creates missing tables and indexes,
 * it never adds columns), is idempotent and safe to run on every start.
 *
 * - creates santa_group and, when there is none yet, the default group with the old site settings;
 * - adds groupId to user, family, analytics_event and audit_log and puts every existing row in that group;
 * - drops the old globally unique name/email constraints (sync then creates the per-group unique indexes).
 */
export async function migrateToGroups(sequelize: Sequelize): Promise<void> {
    await Group.sync();
    const select = <T extends object>(sql: string, replacements: Record<string, unknown> = {}) =>
        sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });

    await sequelize.transaction(async transaction => {
        const run = (sql: string, replacements: Record<string, unknown> = {}) => sequelize.query(sql, { replacements, transaction });
        // Serialises concurrent starts (e.g. two pods) so only one of them migrates.
        await run('LOCK TABLE santa_group IN EXCLUSIVE MODE');

        const existing = await sequelize.query<{ id: number }>('SELECT id FROM santa_group ORDER BY id LIMIT 1', { type: QueryTypes.SELECT, transaction });
        let defaultGroupId = existing[0]?.id;
        if (!defaultGroupId) {
            const settings = await legacySettings(sequelize);
            const [rows] = await run(
                `INSERT INTO santa_group (name, settings, "createdAt", "updatedAt") VALUES (:name, :settings::jsonb, NOW(), NOW()) RETURNING id`,
                { name: DEFAULT_GROUP_NAME, settings: JSON.stringify(settings) },
            );
            defaultGroupId = (rows as { id: number }[])[0].id;
            logger.log(`Created the group "${DEFAULT_GROUP_NAME}" (#${defaultGroupId})`);
        }

        const missing = await select<{ table_name: string }>(`
            SELECT t.table_name FROM information_schema.tables t
            WHERE t.table_schema = current_schema() AND t.table_name IN ('user', 'family', 'analytics_event', 'audit_log')
              AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                              WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name = 'groupId')`);
        const needs = new Set(missing.map(row => row.table_name));
        const replacements = { groupId: defaultGroupId };

        for (const table of ['family', 'user']) {
            if (!needs.has(table)) continue;
            await run(`ALTER TABLE "${table}" ADD COLUMN "groupId" INTEGER REFERENCES santa_group (id) ON DELETE CASCADE ON UPDATE CASCADE`);
            await run(`UPDATE "${table}" SET "groupId" = :groupId`, replacements);
            await run(`ALTER TABLE "${table}" ALTER COLUMN "groupId" SET NOT NULL`);
        }
        if (needs.has('user')) {
            await run('ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_name_key"');
            await run('ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_email_key"');
        }
        if (needs.has('family')) {
            await run('ALTER TABLE "family" DROP CONSTRAINT IF EXISTS "family_name_key"');
        }
        // Everything recorded so far happened in the only group there was, anonymous visits included.
        for (const table of ['analytics_event', 'audit_log']) {
            if (!needs.has(table)) continue;
            await run(`ALTER TABLE "${table}" ADD COLUMN "groupId" INTEGER`);
            await run(`UPDATE "${table}" SET "groupId" = :groupId`, replacements);
        }
        if (needs.size) {
            logger.log(`Moved ${[...needs].join(', ')} into group #${defaultGroupId}`);
        }
    });
}

/** The site settings from the old global key/value table, which become the default group's settings. */
async function legacySettings(sequelize: Sequelize): Promise<Record<string, unknown>> {
    const [table] = await sequelize.query<{ exists: boolean }>(`SELECT to_regclass('setting') IS NOT NULL AS exists`, { type: QueryTypes.SELECT });
    if (!table?.exists) {
        return {};
    }
    const rows = await sequelize.query<{ key: string; value: unknown }>(
        'SELECT key, value FROM setting WHERE key IN (:keys)',
        { replacements: { keys: SETTING_KEYS }, type: QueryTypes.SELECT },
    );
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
}
