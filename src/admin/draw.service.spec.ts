import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DrawService } from './draw.service';
import { EncryptionService } from 'src/encryption/encryption.service';

interface FakeUser {
    id: number;
    groupId: number;
    name: string;
    familyId: number | null;
    lastYearGiftingToId: number | null;
    encryptionStrategy: string;
    giftingTo: string;
    decryptionCode: string;
    iv: string;
    email: string;
}

/** In-memory stand-ins for the Sequelize models the service uses. */
function setup(people: Array<Partial<FakeUser> & { id: number; name: string }>) {
    const users: FakeUser[] = people.map(p => ({
        groupId: GROUP, familyId: null, lastYearGiftingToId: null, encryptionStrategy: 'code',
        giftingTo: '', decryptionCode: '', iv: '', email: '', ...p,
    }));
    const inGroup = (where: { groupId?: number }) => (u: FakeUser) => where.groupId === undefined || u.groupId === where.groupId;
    const userRepository = {
        findAll: async (options: { where?: { groupId?: number } } = {}) => users.filter(inGroup(options.where ?? {})),
        update: async (values: Partial<FakeUser>, options: { where: { id?: number; groupId?: number } }) => {
            users.filter(u => (options.where.id === undefined || u.id === options.where.id) && inGroup(options.where)(u))
                .forEach(u => Object.assign(u, values));
        },
    };
    const familyIds = [...new Set(users.map(u => u.familyId).filter(Boolean))] as number[];
    const familyRepository = { findAll: async () => familyIds.map(id => ({ id, name: `Family ${id}` })) };
    const sequelize = { transaction: async (fn: (t: object) => Promise<unknown>) => fn({ LOCK: { UPDATE: 'UPDATE' } }) };
    const audit = { log: jest.fn(), lastOccurrence: async () => null };
    const encryption = new EncryptionService();
    const service = new DrawService(userRepository as any, familyRepository as any, sequelize as any, encryption, audit as any, new Logger());
    return { service, users, encryption, audit };
}

const actor = { id: 1, name: 'Admin' };
const GROUP = 1;

describe('DrawService', () => {
    jest.setTimeout(60000);

    it('assigns everyone once, outside their family and away from last year', async () => {
        const { service, users, encryption } = setup([
            { id: 1, name: 'Ann', familyId: 1, lastYearGiftingToId: 3 },
            { id: 2, name: 'Ben', familyId: 1 },
            { id: 3, name: 'Cat', familyId: 2, lastYearGiftingToId: 5 },
            { id: 4, name: 'Dan', familyId: 2 },
            { id: 5, name: 'Eve' },
            { id: 6, name: 'Fay', lastYearGiftingToId: 1 },
        ]);
        for (let round = 0; round < 5; round++) {
            const status = await service.run(actor, GROUP);
            expect(status.state).toBe('valid');
            const byName = new Map(users.map(u => [u.name, u]));
            const recipients = users.map(u => byName.get(encryption.decryptGiftingTo(u as any))!);
            expect(new Set(recipients.map(r => r.id)).size).toBe(users.length);
            users.forEach((santa, i) => {
                const recipient = recipients[i];
                expect(recipient.id).not.toBe(santa.id);
                if (santa.familyId) expect(recipient.familyId).not.toBe(santa.familyId);
                expect(recipient.id).not.toBe(santa.lastYearGiftingToId);
            });
        }
    });

    it('reports an impossible draw instead of writing a broken one', async () => {
        const { service, users } = setup([
            { id: 1, name: 'Ann', familyId: 1 },
            { id: 2, name: 'Ben', familyId: 1 },
            { id: 3, name: 'Cat', familyId: 1 },
            { id: 4, name: 'Dan' },
        ]);
        const constraints = await service.constraints(GROUP);
        expect(constraints.feasible).toBe(false);
        expect(constraints.warnings.join(' ')).toContain('at most half');
        await expect(service.run(actor, GROUP)).rejects.toThrow('No valid draw');
        expect(users.every(u => u.giftingTo === '')).toBe(true);
    });

    it('fails the checks when a recipient was renamed behind its back', async () => {
        const { service, users } = setup([{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat' }]);
        await service.run(actor, GROUP);
        users[1].name = 'Benjamin';
        const status = await service.status(GROUP);
        expect(status.state).toBe('invalid');
        expect(status.checks.find(c => c.key === 'recipients_exist')!.status).toBe('fail');
    });

    it('starts a new season by saving recipients as last year and clearing the draw', async () => {
        const { service, users, encryption } = setup([{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat' }]);
        await service.run(actor, GROUP);
        const expected = users.map(u => users.find(r => r.name === encryption.decryptGiftingTo(u as any))!.id);
        const result = await service.rollover(actor, GROUP);
        expect(result.recorded).toBe(3);
        expect(users.map(u => u.lastYearGiftingToId)).toEqual(expected);
        expect(users.every(u => u.giftingTo === '' && u.decryptionCode === '')).toBe(true);
        expect(result.status.state).toBe('not_drawn');
    });

    it('draws, clears and rolls over one group without touching another', async () => {
        const { service, users, encryption } = setup([
            { id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat' },
            // Same names in another group: names are unique per group only.
            { id: 4, name: 'Ann', groupId: 2 }, { id: 5, name: 'Ben', groupId: 2 }, { id: 6, name: 'Cat', groupId: 2 }, { id: 7, name: 'Dan', groupId: 2 },
        ]);
        const other = users.filter(u => u.groupId === 2);
        await service.run(actor, 2);
        const otherDraw = other.map(u => ({ ...u }));

        const status = await service.run(actor, GROUP);
        expect(status.participants).toBe(3);
        expect(status.state).toBe('valid');
        expect(other).toEqual(otherDraw);
        const first = users.filter(u => u.groupId === GROUP);
        expect(first.map(u => encryption.decryptGiftingTo(u as any)).sort()).toEqual(['Ann', 'Ben', 'Cat']);

        await service.clear(actor, GROUP);
        expect(first.every(u => u.giftingTo === '')).toBe(true);
        expect(other).toEqual(otherDraw);
        expect((await service.status(2)).state).toBe('valid');
    });
});

describe('DrawService: adding a latecomer', () => {
    const chain = (users: FakeUser[], encryption: EncryptionService) => {
        const byName = new Map(users.map(u => [u.name, u]));
        return new Map(users.filter(u => u.giftingTo).map(u => [u.id, byName.get(encryption.decryptGiftingTo(u as any))!.id]));
    };

    it('splices them in after one Santa and leaves everyone else, and every link, as it was', async () => {
        const { service, users, encryption } = setup([{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat' }, { id: 4, name: 'Dan' }]);
        await service.run(actor, GROUP);
        const before = chain(users, encryption);
        const codes = new Map(users.map(u => [u.id, u.decryptionCode]));
        users.push({ id: 5, groupId: GROUP, name: 'Liz', familyId: null, lastYearGiftingToId: null, encryptionStrategy: 'code', giftingTo: '', decryptionCode: '', iv: '', email: '' });

        const candidates = await service.insertionCandidates(GROUP, 5);
        expect(candidates.map(u => u.id).sort()).toEqual([1, 2, 3, 4]);
        await service.insert(actor, GROUP, 5, 2, true);

        const after = chain(users, encryption);
        expect(after.get(2)).toBe(5);
        expect(after.get(5)).toBe(before.get(2));
        for (const id of [1, 3, 4]) expect(after.get(id)).toBe(before.get(id));
        for (const id of [1, 2, 3, 4]) expect(users.find(u => u.id === id)!.decryptionCode).toBe(codes.get(id));
        expect(users.find(u => u.id === 5)!.decryptionCode).toMatch(/.{20,}/);
        expect((await service.status(GROUP)).state).toBe('valid');
    });

    it('only offers Santas that follow the family and last-year rules both ways', async () => {
        const { service, users, encryption } = setup([
            { id: 1, name: 'Ann', familyId: 1 }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat', familyId: 2 },
            { id: 4, name: 'Dan', familyId: 2 }, { id: 5, name: 'Eve', lastYearGiftingToId: 6 },
        ]);
        await service.run(actor, GROUP);
        users.push({ id: 6, groupId: GROUP, name: 'Liz', familyId: 1, lastYearGiftingToId: 2, encryptionStrategy: 'code', giftingTo: '', decryptionCode: '', iv: '', email: '' });
        const links = chain(users, encryption);
        const allowed = (await service.insertionCandidates(GROUP, 6)).map(u => u.id);
        for (const santa of [1, 2, 3, 4, 5]) {
            const recipient = links.get(santa)!;
            const ok = santa !== 1 && santa !== 5 && recipient !== 1 && recipient !== 2;
            expect(allowed.includes(santa)).toBe(ok);
        }
        await expect(service.insert(actor, GROUP, 6, 1, true)).rejects.toThrow('cannot give to them');
    });

    it('refuses before a draw, and for someone already in it', async () => {
        const { service } = setup([{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat' }]);
        await expect(service.insertionCandidates(GROUP, 3)).rejects.toThrow('has not been run');
        await service.run(actor, GROUP);
        await expect(service.insertionCandidates(GROUP, 3)).rejects.toThrow('already in the draw');
    });
});

describe('DrawService: choosing a recipient by hand', () => {
    const chain = (users: FakeUser[], encryption: EncryptionService) => {
        const byName = new Map(users.map(u => [u.name, u]));
        return new Map(users.filter(u => u.giftingTo).map(u => [u.id, byName.get(encryption.decryptGiftingTo(u as any))!.id]));
    };
    /** Writes a fixed chain, e.g. [1, 2, 3] means 1 -> 2 -> 3 -> 1. */
    const draw = (users: FakeUser[], encryption: EncryptionService, order: number[]) => order.forEach((id, i) => {
        const santa = users.find(u => u.id === id)!;
        const recipient = users.find(u => u.id === order[(i + 1) % order.length])!;
        Object.assign(santa, encryption.reencryptGiftingTo({ ...santa, decryptionCode: santa.decryptionCode || `code-${id}` } as any, recipient.name));
    });
    const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

    it('moves the chosen recipient next to them, keeping one chain and everyone\'s link', async () => {
        const { service, users, encryption, audit } = setup(people(5));
        draw(users, encryption, [1, 2, 3, 4, 5]);
        const codes = users.map(u => u.decryptionCode);
        // 1 -> 4: 4 leaves its place (3 -> 5) and goes between 1 and 2.
        const { changed, kind } = await service.reassign(actor, GROUP, 1, 4, new Set());
        expect(kind).toBe('move');
        expect(Object.fromEntries(chain(users, encryption))).toEqual({ 1: 4, 4: 2, 2: 3, 3: 5, 5: 1 });
        expect(changed.map(u => u.id).sort()).toEqual([3, 4]);
        expect(users.map(u => u.decryptionCode)).toEqual(codes);
        const status = await service.status(GROUP);
        expect(status.state).toBe('valid');
        expect(status.checks.find(c => c.key === 'single_chain')!.status).toBe('pass');
        expect(audit.log).toHaveBeenCalledWith(actor, expect.objectContaining({ action: 'draw.reassign', entityId: 1, summary: expect.stringMatching(/^Set P1 to give to \|\|P4\|\| /) }));
    });

    it('swaps instead when the moved person already opened their mission', async () => {
        const { service, users, encryption } = setup(people(5));
        draw(users, encryption, [1, 2, 3, 4, 5]);
        const { changed, kind } = await service.reassign(actor, GROUP, 1, 4, new Set([4]));
        expect(kind).toBe('swap');
        expect(Object.fromEntries(chain(users, encryption))).toEqual({ 1: 4, 3: 2, 2: 3, 4: 5, 5: 1 });
        expect(changed.map(u => u.id)).toEqual([3]);
        expect((await service.status(GROUP)).state).toBe('valid');
    });

    it('swaps when moving would break the family rule for someone else', async () => {
        // 1 -> 2 -> 3 -> 4 -> 5 -> 1. Moving 4 next to 1 needs 3 -> 5, but they are family.
        const { service, users, encryption } = setup([
            { id: 1, name: 'P1' }, { id: 2, name: 'P2' }, { id: 3, name: 'P3', familyId: 9 }, { id: 4, name: 'P4' }, { id: 5, name: 'P5', familyId: 9 },
        ]);
        draw(users, encryption, [1, 2, 3, 4, 5]);
        await service.reassign(actor, GROUP, 1, 4, new Set());
        expect(Object.fromEntries(chain(users, encryption))).toEqual({ 1: 4, 3: 2, 2: 3, 4: 5, 5: 1 });
    });

    it('refuses when no re-wiring follows the rules, and leaves the draw alone', async () => {
        // 1 -> 2 -> 3 -> 4 -> 1. 1 -> 3 needs 2 -> 4 (family) or 2 -> 2 (themselves).
        const { service, users, encryption } = setup([
            { id: 1, name: 'Ann' }, { id: 2, name: 'Ben', familyId: 9 }, { id: 3, name: 'Cat' }, { id: 4, name: 'Dan', familyId: 9 },
        ]);
        draw(users, encryption, [1, 2, 3, 4]);
        const before = chain(users, encryption);
        const cat = (await service.reassignOptions(GROUP, 1)).find(o => o.name === 'Cat')!;
        expect(cat.blocked).toBe('does not fit without breaking the rules for others');
        await expect(service.reassign(actor, GROUP, 1, 3, new Set())).rejects.toThrow('does not fit');
        expect(chain(users, encryption)).toEqual(before);
    });

    it('rejects their family, last year\'s recipient, their current recipient and people outside the draw', async () => {
        const { service, users, encryption } = setup([
            { id: 1, name: 'Ann', familyId: 1, lastYearGiftingToId: 4 }, { id: 2, name: 'Ben', familyId: 1 },
            { id: 3, name: 'Cat' }, { id: 4, name: 'Dan' }, { id: 5, name: 'Eve' }, { id: 6, name: 'Liz' },
        ]);
        draw(users, encryption, [1, 3, 2, 5, 4]);
        const options = Object.fromEntries((await service.reassignOptions(GROUP, 1)).map(o => [o.name, o.blocked]));
        expect(options).toEqual({ Ben: 'same family', Cat: null, Dan: "last year's recipient", Eve: null, Liz: 'not in the draw' });
        await expect(service.reassign(actor, GROUP, 1, 2, new Set())).rejects.toThrow('cannot give to Ben');
        await expect(service.reassign(actor, GROUP, 1, 3, new Set())).rejects.toThrow('already gives to Cat');
        await expect(service.reassign(actor, GROUP, 1, 6, new Set())).rejects.toThrow('not in the draw');
        await expect(service.reassignOptions(GROUP, 6)).rejects.toThrow('not in the draw');
    });
});

describe('EncryptionService', () => {
    const encryption = new EncryptionService();

    /** How assignments were stored before November 2026. */
    function legacyRow(id: number, name: string) {
        const code = crypto.randomBytes(20).toString('base64').substring(0, 26);
        const key = crypto.pbkdf2Sync(code, id.toString(), 100000, 32, 'sha256');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const giftingTo = cipher.update(name, 'utf8', 'hex') + cipher.final('hex');
        return { id, encryptionStrategy: 'code', decryptionCode: code, iv: iv.toString('hex'), giftingTo } as any;
    }

    it('stores the recipient base64 encoded with a fresh link code', async () => {
        const santa: any = { id: 7, encryptionStrategy: 'code' };
        Object.assign(santa, await encryption.encryptGiftingTo(santa, 'Mari-Liis Õunapuu'));
        expect(santa.giftingTo).toBe(Buffer.from('Mari-Liis Õunapuu').toString('base64'));
        expect(santa.iv).toBe('');
        expect(santa.decryptionCode).toHaveLength(26);
        expect(encryption.decryptGiftingTo(santa)).toBe('Mari-Liis Õunapuu');
    });

    it('re-encoding keeps the code so the personal link still works', async () => {
        const santa: any = { id: 7, encryptionStrategy: 'code' };
        Object.assign(santa, await encryption.encryptGiftingTo(santa, 'Old Name'));
        const code = santa.decryptionCode;
        Object.assign(santa, encryption.reencryptGiftingTo(santa, 'New Name'));
        expect(santa.decryptionCode).toBe(code);
        expect(encryption.decryptGiftingTo(santa)).toBe('New Name');
    });

    it('still reads old AES rows and converts them without changing the code', () => {
        const santa = legacyRow(3, 'Jüri Tamm');
        const code = santa.decryptionCode;
        expect(encryption.isLegacyAssignment(santa)).toBe(true);
        expect(encryption.decryptGiftingTo(santa)).toBe('Jüri Tamm');
        Object.assign(santa, encryption.reencryptGiftingTo(santa, encryption.decryptGiftingTo(santa)));
        expect(encryption.isLegacyAssignment(santa)).toBe(false);
        expect(santa.decryptionCode).toBe(code);
        expect(santa.giftingTo).toBe(Buffer.from('Jüri Tamm').toString('base64'));
    });
});
