import * as crypto from 'crypto';
import { EncryptionService, EncryptionStrategy } from './encryption.service';

describe('EncryptionService', () => {
    const service = new EncryptionService();
    const user = (overrides: object = {}) =>
        ({ id: 3, encryptionStrategy: EncryptionStrategy.CODE, ...overrides }) as any;

    it('round-trips an assignment and issues a random code', async () => {
        const a = await service.encryptGiftingTo(user(), 'Mari Maasikas');
        const b = await service.encryptGiftingTo(user(), 'Mari Maasikas');
        expect(a.decryptionCode.length).toBeGreaterThanOrEqual(26);
        expect(a.decryptionCode).not.toBe(b.decryptionCode);
        expect(service.decryptGiftingTo(user(a))).toBe('Mari Maasikas');
    });

    it('keeps the code when re-encoding after a rename, so sent links keep working', async () => {
        const a = await service.encryptGiftingTo(user(), 'Mari Maasikas');
        const renamed = service.reencryptGiftingTo(user(a), 'Mari Kask');
        expect(renamed.decryptionCode).toBe(a.decryptionCode);
        expect(service.decryptGiftingTo(user(renamed))).toBe('Mari Kask');
    });

    it('still reads legacy AES-256-CBC assignments', () => {
        const code = crypto.randomBytes(20).toString('base64').substring(0, 26);
        const key = crypto.pbkdf2Sync(code, '3', 100000, 32, 'sha256');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        const legacy = cipher.update('Jaan Tamm', 'utf8', 'hex') + cipher.final('hex');
        expect(service.decryptGiftingTo(user({ giftingTo: legacy, decryptionCode: code, iv: iv.toString('hex') }))).toBe('Jaan Tamm');
    });

    it('refuses to decrypt without a code', () => {
        expect(() => service.decryptGiftingTo(user({ giftingTo: 'TWFyaQ==', decryptionCode: '', iv: '' }))).toThrow();
    });
});
