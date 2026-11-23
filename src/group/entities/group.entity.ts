import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { User } from 'src/user/entities/user.entity';

/**
 * One Secret Santa group (tenant): its own participants, families, draw, dossiers, settings, analytics,
 * activity log and maze leaderboard. Santa's voice lines and the agency facts are shared by every group.
 * The table is not called "group" because GROUP is a reserved word in SQL.
 */
@Table({
    tableName: 'santa_group',
})
export class Group extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column({ allowNull: false })
    name: string;

    /** The group's site settings (see SiteSettings); keys that are missing use the defaults. */
    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
    settings: Record<string, unknown>;

    @HasMany(() => User, { foreignKey: 'groupId' })
    members: User[];
}
