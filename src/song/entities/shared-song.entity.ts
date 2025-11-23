import { Column, Table, Model } from 'sequelize-typescript';

@Table({
    tableName: 'shared_song',
})
export class SharedSong extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column({
        type: 'TEXT',
    })
    songUrl: string;

    @Column
    updatedBy: string; // Name of user who last updated

    @Column
    updatedAt: Date;
}
