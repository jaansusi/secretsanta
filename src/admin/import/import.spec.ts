import { ImportFile, parseImportFile } from './import-file';
import { ExistingUser, planImport } from './import-plan';

const b64 = (name: string) => Buffer.from(name, 'utf8').toString('base64');
// Same folding as UserService.normalizeEmail.
const normalize = (email: string) => email.trim().toLowerCase()
    .replace(/^([^@+]+)(\+[^@]*)?@(gmail|googlemail)\.com$/, (_m, user) => user.replace(/\./g, '') + '@gmail.com');

function validFile(overrides: Record<string, unknown> = {}) {
    return {
        format: 'secretsanta',
        version: 1,
        source: 'test',
        families: [{ id: 10, name: 'Susid' }],
        participants: [
            { id: 1, name: 'Mari', email: 'Mari.Tamm+santa@Gmail.com', familyId: 10, isAdmin: true, encryptionStrategy: 'code', giftingTo: b64('Jüri'), decryptionCode: 'code-1', lastYearGiftingToId: 2, interestingFacts: 'a\nb' },
            { id: 2, name: 'Jüri', email: null, familyId: null, giftingTo: b64('Mari'), decryptionCode: 'code-2' },
        ],
        ...overrides,
    };
}

function parse(data: unknown) {
    return parseImportFile(data, normalize);
}

describe('parseImportFile', () => {
    it('accepts a valid file, normalizes e-mails and fills defaults', () => {
        const { file, errors } = parse(validFile());
        expect(errors).toEqual([]);
        expect(file!.participants[0].email).toBe('maritamm@gmail.com');
        expect(file!.participants[1]).toMatchObject({ isAdmin: false, encryptionStrategy: 'code', lastYearGiftingToId: null, interestingFacts: null });
    });

    it.each([
        ['not an object', [], 'not a JSON object'],
        ['another format', { format: 'x', version: 1 }, 'Not a Secret Santa data file'],
        ['another version', { format: 'secretsanta', version: 2 }, 'Unsupported file version'],
    ])('rejects %s', (_label, data, message) => {
        expect(parse(data).errors[0]).toContain(message);
    });

    it('reports every problem at once', () => {
        const data = validFile({
            families: [{ id: 10, name: 'Susid' }, { id: 10, name: 'susid' }],
            participants: [
                { id: 1, name: 'Mari', familyId: 99, giftingTo: b64('Nobody'), decryptionCode: 'c' },
                { id: 1, name: 'mari', email: 'not-an-email', lastYearGiftingToId: 1 },
                { id: 3, name: 'Kati', giftingTo: b64('Mari') },
                { id: 4, name: 'Self', giftingTo: b64('Self'), decryptionCode: 'd', encryptionStrategy: 'rot13' },
            ],
        });
        const errors = parse(data).errors.join('\n');
        expect(errors).toContain('Two families have id 10');
        expect(errors).toContain('Two families are called "susid"');
        expect(errors).toContain('Two participants have id 1');
        expect(errors).toContain('Two participants are called "mari"');
        expect(errors).toContain('does not look like an e-mail address');
        expect(errors).toContain('familyId 99 is not in "families"');
        expect(errors).toContain('assigned to "Nobody", who is not in "participants"');
        expect(errors).toContain('Kati: has an assignment (giftingTo) but no decryptionCode');
        expect(errors).toContain('encryptionStrategy must be one of');
    });

    it('rejects an assignment that is not base64 text', () => {
        const data = validFile();
        (data.participants as any)[1].giftingTo = '6c1f0e9a2b'; // hex from the old AES format
        expect(parse(data).errors.join()).toContain('giftingTo is not a base64-encoded name');
    });

    it('rejects duplicate decryption codes', () => {
        const data = validFile();
        (data.participants as any)[1].decryptionCode = 'code-1';
        expect(parse(data).errors).toContain('Two participants have the same decryption code.');
    });
});

describe('planImport', () => {
    const file = parse(validFile()).file as ImportFile;
    const user = (fields: Partial<ExistingUser>): ExistingUser => ({
        id: 1, name: 'x', email: null, isAdmin: false, giftingTo: null, decryptionCode: null, ...fields,
    });

    it('creates everything in an empty database', () => {
        const plan = planImport(file, [], []);
        expect(plan.errors).toEqual([]);
        expect(plan.families).toEqual([{ fileId: 10, name: 'Susid', existingId: null }]);
        expect(plan.participants.map(p => p.existingId)).toEqual([null, null]);
        expect(plan.warnings).toEqual([]);
    });

    it('matches families by name and participants by e-mail, then by name', () => {
        const plan = planImport(file, [{ id: 5, name: 'SUSID' }], [
            user({ id: 7, name: 'Mari Tamm', email: 'maritamm@gmail.com' }),
            user({ id: 8, name: 'jüri' }),
        ]);
        expect(plan.families[0].existingId).toBe(5);
        expect(plan.participants.map(p => [p.row.name, p.existingId, p.previousName])).toEqual([
            ['Mari', 7, 'Mari Tamm'],
            ['Jüri', 8, 'jüri'],
        ]);
    });

    it('never removes admin access', () => {
        const plan = planImport(file, [], [user({ id: 3, name: 'Jüri', isAdmin: true })]);
        expect(plan.participants.find(p => p.row.name === 'Jüri')!.isAdmin).toBe(true);
    });

    it('leaves participants that are not in the file alone, with a warning', () => {
        const plan = planImport(file, [], [user({ id: 9, name: 'Peeter', giftingTo: b64('Kati'), decryptionCode: 'other' })]);
        expect(plan.untouched.map(u => u.name)).toEqual(['Peeter']);
        expect(plan.warnings.join()).toContain('Peeter');
        expect(plan.warnings.join()).toContain('Check the draw page');
    });

    it('refuses when the e-mail and the name point at different participants', () => {
        const plan = planImport(file, [], [
            user({ id: 1, name: 'Someone', email: 'maritamm@gmail.com' }),
            user({ id: 2, name: 'Mari' }),
        ]);
        expect(plan.errors.join()).toContain('belongs to Someone');
    });

    it('refuses a decryption code that a participant outside the file already uses', () => {
        const plan = planImport(file, [], [user({ id: 9, name: 'Peeter', decryptionCode: 'code-2' })]);
        expect(plan.errors.join()).toContain('decryption code is already used');
    });
});
