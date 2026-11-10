import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DrawService } from './draw.service';
import { EncryptionService } from 'src/encryption/encryption.service';

interface FakeUser {
    id: number;
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
        familyId: null, lastYearGiftingToId: null, encryptionStrategy: 'code',
        giftingTo: '', decryptionCode: '', iv: '', email: '', ...p,
    }));
    const userRepository = {
        findAll: async () => users,
        update: async (values: Partial<FakeUser>, options: { where: { id?: number } }) => {
            users.filter(u => options.where.id === undefined || u.id === options.where.id).forEach(u => Object.assign(u, values));
        },
    };
    const familyIds = [...new Set(users.map(u => u.familyId).filter(Boolean))] as number[];
    const familyRepository = { findAll: async () => familyIds.map(id => ({ id, name: `Family ${id}` })) };
    const sequelize = { transaction: async (fn: (t: object) => Promise<void>) => fn({}) };
    const audit = { log: jest.fn(), lastOccurrence: async () => null };
    const encryption = new EncryptionService();
    const service = new DrawService(userRepository as any, familyRepository as any, sequelize as any, encryption, audit as any, new Logger());
    return { service, users, encryption, audit };
}

const actor = { id: 1, name: 'Admin' };

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
            const status = await service.run(actor);
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
        const constraints = await service.constraints();
        expect(constraints.feasible).toBe(false);
        expect(constraints.warnings.join(' ')).toContain('at most half');
        await expect(service.run(actor)).rejects.toThrow('No valid draw');
        expect(users.every(u => u.giftingTo === '')).toBe(true);
    });

    it('fails the checks when a recipient was renamed behind its back', async () => {
        const { service, users } = setup([{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat' }]);
        await service.run(actor);
        users[1].name = 'Benjamin';
        const status = await service.status();
        expect(status.state).toBe('invalid');
        expect(status.checks.find(c => c.key === 'recipients_exist')!.status).toBe('fail');
    });

    it('starts a new season by saving recipients as last year and clearing the draw', async () => {
        const { service, users, encryption } = setup([{ id: 1, name: 'Ann' }, { id: 2, name: 'Ben' }, { id: 3, name: 'Cat' }]);
        await service.run(actor);
        const expected = users.map(u => users.find(r => r.name === encryption.decryptGiftingTo(u as any))!.id);
        const result = await service.rollover(actor);
        expect(result.recorded).toBe(3);
        expect(users.map(u => u.lastYearGiftingToId)).toEqual(expected);
        expect(users.every(u => u.giftingTo === '' && u.decryptionCode === '')).toBe(true);
        expect(result.status.state).toBe('not_drawn');
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
