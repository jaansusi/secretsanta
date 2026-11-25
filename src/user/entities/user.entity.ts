import { Op } from 'sequelize';
import { Column, DataType, Table, Model, BelongsTo, HasMany, ForeignKey } from 'sequelize-typescript';
import { EncryptionStrategy } from 'src/encryption/encryption.service';
import { Family } from 'src/family/entities/family.entity';
import { Group } from 'src/group/entities/group.entity';

/**
 * A participant of one group. The same person can take part in several groups: they then have one row
 * per group (each with its own link, recipient, dossier and maze games), matched by e-mail at Google sign-in.
 */
@Table({
    tableName: 'user',
    indexes: [
        { name: 'user_group_name', unique: true, fields: ['groupId', 'name'] },
        { name: 'user_group_email', unique: true, fields: ['groupId', 'email'] },
        // A personal link leads to exactly one participant, in whichever group (cleared codes are '').
        { name: 'user_decryption_code', unique: true, fields: ['decryptionCode'], where: { decryptionCode: { [Op.ne]: '' } } },
    ],
})
export class User extends Model {
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

    /** Unique within the group (normalized, see UserService.normalizeEmail). */
    @Column
    email: string;

    @Column
    giftingTo: string;

    // Used for debugging purposes, not populated in production
    @Column
    giftingToDebug: string;

    @Column
    decryptionCode?: string;

    @Column
    iv: string;

    @Column({
        defaultValue: EncryptionStrategy.CODE,
        allowNull: false,
    })
    encryptionStrategy: string;

    @Column({
        defaultValue: false,
    })
    isAdmin: boolean;

    /**
     * The participant's one codename ("Agent Musimops"), unique within the group: the maze scoreboard shows
     * it instead of the real name, and their own and their Santa's dossiers show it. Given automatically
     * when first needed (UserService.agentNames); see agent-names.ts.
     */
    @Column({ type: DataType.STRING(60) })
    agentName: string | null;

    @Column
    familyId: number;

    @BelongsTo(() => Family, { foreignKey: 'familyId'})
    family: Family;

    @Column
    lastYearGiftingToId: number;

    @Column({
        type: 'TEXT',
    })
    interestingFacts: string;

    // to-do: implement usage of this
    @HasMany(() => UserHistoricalEntry, { foreignKey: 'id'})
    historicalEntries: UserHistoricalEntry[];
}

// to-do: implement usage of this
@Table({
    tableName: 'userHistoricalEntry',
})
export class UserHistoricalEntry extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @BelongsTo(() => User, { foreignKey: 'id'})
    userId: number;

    @Column
    userName: number;

    // For manual entry, ideally calculates the hash and does not store the plaintext
    @Column
    giftingTo: string;

    @Column
    giftingToHash: string;

    @Column
    createdAt: Date;
}