import { Column, DataType, Model, Table } from 'sequelize-typescript';

/**
 * A made-up "agency intelligence" line ("Krokodille taltsutatud: 6"). Each dossier shows a few of them,
 * spread evenly over each group's participants (see assignAgencyFacts).
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
