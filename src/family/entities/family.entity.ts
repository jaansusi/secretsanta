import { Column, Table, Model, HasMany, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from 'src/user/entities/user.entity';
import { Group } from 'src/group/entities/group.entity';

@Table({
    tableName: 'family',
    indexes: [{ name: 'family_group_name', unique: true, fields: ['groupId', 'name'] }],
})
export class Family extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @ForeignKey(() => Group)
    @Column({ allowNull: false })
    groupId: number;

    @BelongsTo(() => Group, { foreignKey: 'groupId', onDelete: 'CASCADE' })
    group: Group;

    /** Unique within the group. */
    @Column
    name: string;

    @HasMany(() => User, { foreignKey: 'familyId' })
    members: User[];
}
