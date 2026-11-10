import { Column, DataType, Model, Table } from 'sequelize-typescript';

/** Key/value store for site settings edited in the admin panel. Values are JSON. */
@Table({
    tableName: 'setting',
})
export class Setting extends Model {
    @Column({
        primaryKey: true,
    })
    key: string;

    @Column({ type: DataType.JSONB })
    value: unknown;
}
