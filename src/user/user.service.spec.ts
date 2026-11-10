import { UserService } from './user.service';

describe('UserService', () => {
    const repository = { findOne: jest.fn(), findByPk: jest.fn() };
    const service = new UserService(repository as any);

    beforeEach(() => {
        repository.findOne.mockReset().mockResolvedValue({ id: 1 });
        repository.findByPk.mockReset().mockResolvedValue({ id: 1 });
    });

    describe('getByDecryptionCode', () => {
        it('looks up a plausible code string', async () => {
            await service.getByDecryptionCode('  abcdefghijklmnopqrstuvwxyz ');
            expect(repository.findOne).toHaveBeenCalledWith({ where: { decryptionCode: 'abcdefghijklmnopqrstuvwxyz' } });
        });

        it.each([
            ['an array (?code[]=a&code[]=b)', ['abcdefghijklmnopqrstuvwxyz', '']],
            ['an object (?code[x]=y)', { x: 'abcdefghijklmnopqrstuvwxyz' }],
            ['an empty string', ''],
            ['a short string', 'abc'],
            ['an oversized string', 'a'.repeat(1000)],
            ['undefined', undefined],
            ['a number', 1234567890123456],
        ])('never queries for %s', async (_label, code) => {
            expect(await service.getByDecryptionCode(code)).toBeNull();
            expect(repository.findOne).not.toHaveBeenCalled();
        });
    });

    it('rejects invalid ids without querying', async () => {
        for (const id of [NaN, 0, -1, 1.5]) {
            expect(await service.getById(id)).toBeNull();
        }
        expect(repository.findByPk).not.toHaveBeenCalled();
    });

    it('normalizes emails for login matching', () => {
        expect(service.normalizeEmail(' Jaan.Tamm+santa@GMAIL.com ')).toBe('jaantamm@gmail.com');
        expect(service.normalizeEmail('j.tamm@googlemail.com')).toBe('jtamm@gmail.com');
        expect(service.normalizeEmail('First.Last@Example.org')).toBe('first.last@example.org');
    });
});
