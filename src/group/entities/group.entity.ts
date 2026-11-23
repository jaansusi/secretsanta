import { Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { User } from 'src/user/entities/user.entity';

/**
 * One Secret Santa group (tenant): its own participants, families, draw, dossiers, settings, analytics,
 * activity log and maze leaderboard. Santa's voice lines and the agency facts are shared by every group.
 * The table is not called "group" because GROUP is a reserved word in SQL.
 */
@Table({
    tableName: 'santa_group',
    // A sign-up link leads to exactly one group.
    indexes: [{ name: 'santa_group_signup_code', unique: true, fields: ['signupCode'] }],
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

    /**
     * The secret in the group's sign-up link (/liitu/<code>), with which people add themselves to the group.
     * Null until an admin first opens sign-up; replacing it makes the old link stop working. Whether sign-up is
     * open is the signupOpen setting.
     */
    @Column({ type: DataType.STRING, allowNull: true })
    signupCode: string | null;

    @HasMany(() => User, { foreignKey: 'groupId' })
    members: User[];
}
