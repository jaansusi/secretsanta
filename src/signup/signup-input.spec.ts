import { parseSignup, SignupContext } from './signup-input';

const context = (overrides: Partial<SignupContext> = {}): SignupContext => ({
    families: [{ id: 3, name: 'Tamm' }, { id: 7, name: 'Kask' }],
    participants: [{ name: 'Mari Tamm', email: 'mari@example.com' }, { name: 'Jüri', email: null }],
    allowNewFamilies: true,
    ...overrides,
});

const errorOf = (body: unknown, ctx = context()) => {
    const result = parseSignup(body, ctx);
    return result.ok ? null : result.error;
};

describe('parseSignup', () => {
    it('accepts a person without a family and normalizes the e-mail', () => {
        const result = parseSignup({ name: '  Peeter   Pähkel ', email: ' Peeter.Pahkel+jõulud@GMail.com ', family: '' }, context());
        expect(result).toEqual({ ok: true, input: { name: 'Peeter Pähkel', email: 'peeterpahkel@gmail.com', family: { kind: 'none' } } });
    });

    it('joins an existing family by id', () => {
        const result = parseSignup({ name: 'Ants', email: 'ants@example.com', family: '7' }, context());
        expect(result.ok && result.input.family).toEqual({ kind: 'existing', familyId: 7 });
    });

    it('creates a new family, or joins the existing one with the same name', () => {
        const created = parseSignup({ name: 'Ants', email: 'ants@example.com', family: 'new', newFamily: ' Saar  pere ' }, context());
        expect(created.ok && created.input.family).toEqual({ kind: 'new', name: 'Saar pere' });
        const matched = parseSignup({ name: 'Ants', email: 'ants@example.com', family: 'new', newFamily: 'tamm' }, context());
        expect(matched.ok && matched.input.family).toEqual({ kind: 'existing', familyId: 3 });
    });

    it('refuses a new family when the group does not allow it', () => {
        expect(errorOf({ name: 'Ants', email: 'ants@example.com', family: 'new', newFamily: 'Saar' }, context({ allowNewFamilies: false })))
            .toMatch(/Uut perekonda/);
    });

    it('refuses a family of another group or a malformed id', () => {
        for (const family of ['99', '3; drop', '-3', 'x']) {
            expect(errorOf({ name: 'Ants', email: 'ants@example.com', family })).toMatch(/perekonda ei leitud/);
        }
    });

    it('requires a name, a plausible e-mail and a name for a new family', () => {
        expect(errorOf({ email: 'ants@example.com' })).toMatch(/nimi/);
        expect(errorOf({ name: 'Ants' })).toMatch(/e-posti/);
        expect(errorOf({ name: 'Ants', email: 'not-an-address' })).toMatch(/e-posti aadress/);
        expect(errorOf({ name: 'Ants', email: 'ants@example.com', family: 'new', newFamily: ' ' })).toMatch(/perekonna nimi/);
        expect(errorOf({ name: 'A'.repeat(101), email: 'ants@example.com' })).toMatch(/100/);
    });

    it('keeps names and e-mails unique within the group, ignoring case and Gmail dots', () => {
        expect(errorOf({ name: 'mari tamm', email: 'other@example.com' })).toMatch(/nimega/);
        expect(errorOf({ name: 'Mari', email: 'MARI@example.com' })).toMatch(/e-posti aadressiga/);
        const gmail = context({ participants: [{ name: 'Liis', email: 'liis.lill@gmail.com' }] });
        expect(errorOf({ name: 'Liisu', email: 'liislill@gmail.com' }, gmail)).toMatch(/e-posti aadressiga/);
    });

    it('ignores fields that are not text and hands the typed values back on error', () => {
        const result = parseSignup({ name: ['Ants'], email: { $ne: '' }, family: 3 }, context());
        expect(result).toEqual({ ok: false, error: expect.any(String), values: { name: '', email: '', family: '', newFamily: '' } });
        const typed = parseSignup({ name: 'Ants', email: 'bad', family: 'new', newFamily: 'Saar' }, context());
        expect(!typed.ok && typed.values).toEqual({ name: 'Ants', email: 'bad', family: 'new', newFamily: 'Saar' });
    });
});
