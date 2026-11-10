import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * One thing that happened on the public site (a page view, a reveal, Santa's briefing finishing...).
 * userId is deliberately not a foreign key, so history survives a participant being deleted.
 * No IP addresses are stored; visitorId is a random first-party cookie.
 */
@Table({
    tableName: 'analytics_event',
    updatedAt: false,
    indexes: [{ fields: ['createdAt'] }, { fields: ['type'] }, { fields: ['userId'] }],
})
export class AnalyticsEvent extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column({ allowNull: false })
    type: string;

    @Column
    userId: number;

    @Column
    visitorId: string;

    @Column
    path: string;

    /** mobile | tablet | desktop */
    @Column
    device: string;

    @Column
    browser: string;

    @Column
    os: string;

    @Column({ type: DataType.JSONB })
    meta: Record<string, unknown>;

    declare createdAt: Date;
}
