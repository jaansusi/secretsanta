import { Column, DataType, Model, Table } from 'sequelize-typescript';

export type SantaLineKind = 'intro' | 'name' | 'outro';
export const SANTA_LINE_KINDS: SantaLineKind[] = ['intro', 'name', 'outro'];

/**
 * One text Santa can say. Santa's briefing is an intro, a name line and an outro, each picked from these.
 * Name lines are templates: {name} is replaced with each participant's name.
 */
@Table({
    tableName: 'santa_line',
})
export class SantaLine extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column({ allowNull: false })
    kind: SantaLineKind;

    /** Order within its kind. */
    @Column({ allowNull: false })
    position: number;

    @Column({ type: DataType.TEXT, allowNull: false })
    text: string;
}
