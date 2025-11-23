import { Column, Table, Model, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { User } from 'src/user/entities/user.entity';

@Table({
    tableName: 'song_history',
    timestamps: true,
})
export class SongHistory extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column({
        type: 'TEXT',
        allowNull: false,
    })
    songUrl: string;

    @ForeignKey(() => User)
    @Column({
        allowNull: false,
    })
    userId: number;

    @BelongsTo(() => User)
    user: User;

    @Column({
        allowNull: false,
    })
    requestedBy: string; // Name of user who requested the song

    @Column({
        allowNull: false,
    })
    requestedAt: Date;
}
