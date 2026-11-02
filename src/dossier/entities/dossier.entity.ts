import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { User } from 'src/user/entities/user.entity';

export type DossierAssetKind = 'photo' | 'audio';

/**
 * Per-recipient "classified file" that the recipient's Santa sees on the reveal page.
 * Kept in its own table so that the user table never carries the binary assets.
 */
@Table({
    tableName: 'dossier',
})
export class Dossier extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @ForeignKey(() => User)
    @Column({
        unique: true,
        allowNull: false,
    })
    userId: number;

    @BelongsTo(() => User, { foreignKey: 'userId', onDelete: 'CASCADE' })
    user: User;

    @Column
    codename: string;

    @Column({
        type: DataType.TEXT,
    })
    missionBrief: string;

    @Column({
        type: DataType.BLOB('long'),
    })
    photo: Buffer;

    @Column
    photoMimeType: string;

    @Column({
        type: DataType.BLOB('long'),
    })
    audio: Buffer;

    @Column
    audioMimeType: string;
}
