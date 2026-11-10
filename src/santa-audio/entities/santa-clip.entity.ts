import { Column, DataType, Model, Table } from 'sequelize-typescript';
import { SantaLineKind } from './santa-line.entity';

/**
 * Generated audio for one line (intro/outro) or for one name line and one participant.
 * text is what was actually spoken; when it no longer matches the line, the clip is out of date.
 */
@Table({
    tableName: 'santa_clip',
    indexes: [{ fields: ['lineId'] }, { fields: ['userId'] }],
})
export class SantaClip extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column({ allowNull: false })
    lineId: number;

    @Column({ allowNull: false })
    kind: SantaLineKind;

    /** Set for name clips only. */
    @Column
    userId: number;

    @Column({ type: DataType.TEXT, allowNull: false })
    text: string;

    @Column({ type: DataType.BLOB('long'), allowNull: false })
    audio: Buffer;

    @Column({ allowNull: false })
    mimeType: string;

    @Column
    bytes: number;

    @Column
    modelId: string;

    @Column
    voiceId: string;

    @Column({ allowNull: false })
    generatedAt: Date;
}
