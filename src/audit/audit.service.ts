import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditActor {
    id: number;
    name: string;
}

export interface AuditEntry {
    /** The group the change was made in; null for shared content (Santa audio, agency facts, the groups). */
    groupId: number | null;
    action: string;
    summary: string;
    entityType?: string;
    entityId?: number;
    details?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
    constructor(
        @InjectModel(AuditLog)
        private readonly auditRepository: typeof AuditLog,
        private readonly logger: Logger,
    ) { }

    public async log(actor: AuditActor | null, entry: AuditEntry): Promise<void> {
        try {
            await this.auditRepository.create({
                groupId: entry.groupId,
                actorId: actor?.id ?? null,
                actorName: actor?.name ?? 'System',
                action: entry.action,
                summary: entry.summary,
                entityType: entry.entityType ?? null,
                entityId: entry.entityId ?? null,
                details: entry.details ?? null,
            });
        } catch (err) {
            this.logger.error(`Could not write audit entry ${entry.action}: ${err.message}`);
        }
    }

    /** One group's entries; `includeShared` adds the changes to shared content (for the super admin). */
    public async list(options: { groupId: number; includeShared?: boolean; limit: number; offset: number; action?: string; entityType?: string; entityId?: number }) {
        const where: WhereOptions = { groupId: options.includeShared ? { [Op.or]: [options.groupId, null] } : options.groupId };
        if (options.action) Object.assign(where, { action: options.action });
        if (options.entityType) Object.assign(where, { entityType: options.entityType });
        if (options.entityId) Object.assign(where, { entityId: options.entityId });
        const { rows, count } = await this.auditRepository.findAndCountAll({
            where,
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            limit: options.limit,
            offset: options.offset,
        });
        return { items: rows.map(row => row.get({ plain: true })), total: count };
    }

    /** When an action last happened in a group, e.g. the group's latest draw. */
    public async lastOccurrence(groupId: number, action: string): Promise<AuditLog | null> {
        return this.auditRepository.findOne({ where: { groupId, action }, order: [['createdAt', 'DESC']] });
    }
}
