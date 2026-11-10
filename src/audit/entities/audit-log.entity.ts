import { Column, DataType, Model, Table } from 'sequelize-typescript';

/** One change made through the admin panel. Names are copied in so entries stay readable after deletes. */
@Table({
    tableName: 'audit_log',
    updatedAt: false,
    indexes: [{ fields: ['createdAt'] }, { fields: ['entityType', 'entityId'] }, { fields: ['action'] }],
})
export class AuditLog extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column
    actorId: number;

    @Column
    actorName: string;

    /** Dotted verb, e.g. participant.update or draw.run */
    @Column({ allowNull: false })
    action: string;

    @Column
    entityType: string;

    @Column
    entityId: number;

    /** Human readable one-liner shown in the activity feed. */
    @Column({ type: DataType.TEXT })
    summary: string;

    @Column({ type: DataType.JSONB })
    details: Record<string, unknown>;

    declare createdAt: Date;
}
