import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * A made-up "agency intelligence" line ("Krokodille taltsutatud: 6"). Each dossier shows a few of them,
 * picked by the recipient's name so the same person always gets the same ones.
 */
@Table({
    tableName: 'agency_fact',
})
export class AgencyFact extends Model {
    @Column({
        primaryKey: true,
        autoIncrement: true,
    })
    id: number;

    @Column({ type: DataType.TEXT, allowNull: false })
    text: string;

    /** Inactive facts are kept but never shown. */
    @Column({ allowNull: false, defaultValue: true })
    active: boolean;
}
