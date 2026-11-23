import { NotFoundException } from '@nestjs/common';
import { SantaAudioController } from './santa-audio.controller';
import { EncryptionStrategy } from 'src/encryption/encryption.service';

/** Who may hear which clip: name clips need an admin of the group or the recipient's own Santa, not just the link. */
describe('SantaAudioController', () => {
    const code = { encryptionStrategy: EncryptionStrategy.CODE, giftingTo: 'enc', decryptionCode: 'c' };
    const users: any[] = [
        { id: 2, groupId: 1, name: 'Anu', ...code },
        { id: 3, groupId: 1, name: 'Mari', ...code },
        // Another group that also has a Mari: their Santa must not hear the first group's Mari.
        { id: 4, groupId: 2, name: 'Mari', ...code },
        { id: 5, groupId: 2, name: 'Toomas', ...code },
    ];
    const recipients: Record<number, string> = { 2: 'Mari', 3: 'Anu', 4: 'Toomas', 5: 'Mari' };
    const clips: Record<string, any> = {
        'intro.mp3': { kind: 'intro', userId: null, audio: Buffer.from('intro'), mimeType: 'audio/mpeg' },
        'mari.mp3': { kind: 'name', userId: 3, audio: Buffer.from('Mari'), mimeType: 'audio/mpeg' },
    };
    const santaAudioService = { getClipAudio: async (file: string) => clips[file] ?? null };
    const sessionService = { getUser: jest.fn() };
    const encryptionService = { decryptGiftingTo: (user: any) => recipients[user.id] };
    const userRepository = {
        findByPk: async (id: number) => users.find(u => u.id === id) ?? null,
        findOne: async ({ where }: any) => users.find(u => u.name === where.name && u.groupId === where.groupId) ?? null,
    };
    /** The groups the signed-in admin manages, set per call. */
    let adminGroups: number[] = [];
    const adminAccess = { canManageGroup: async (_request: unknown, groupId: number) => adminGroups.includes(groupId) };
    const controller = new SantaAudioController(santaAudioService as any, sessionService as any, encryptionService as any, userRepository as any, adminAccess as any);

    /** Runs the handler; returns the cache header on success, or 'denied' for a 404. */
    async function fetchClip(file: string, opts: { santa?: number; adminOf?: number[] } = {}) {
        sessionService.getUser.mockResolvedValue(opts.santa ? users.find(u => u.id === opts.santa) : null);
        adminGroups = opts.adminOf ?? [];
        const headers: Record<string, string> = {};
        const response = { setHeader: (k: string, v: string) => { headers[k] = v; }, status: () => response, end: jest.fn() };
        const request = { headers: {}, signedCookies: {} };
        try {
            await controller.clip(file, request as any, response as any);
            return headers['Cache-Control'];
        } catch (err) {
            if (err instanceof NotFoundException) return 'denied';
            throw err;
        }
    }

    it('serves intro/outro clips to anyone with the signed URL, cacheable publicly', async () => {
        expect(await fetchClip('intro.mp3')).toMatch(/^public/);
    });

    it("refuses a name clip to someone who only has the link", async () => {
        expect(await fetchClip('mari.mp3')).toBe('denied');
    });

    it("plays a name clip for the recipient's own Santa, privately cached", async () => {
        expect(await fetchClip('mari.mp3', { santa: 2 })).toMatch(/^private/);
    });

    it("refuses it to another participant, including the recipient themselves", async () => {
        expect(await fetchClip('mari.mp3', { santa: 3 })).toBe('denied');
    });

    it("plays it for an admin of the recipient's group, but not for an admin of another group", async () => {
        expect(await fetchClip('mari.mp3', { adminOf: [1] })).toMatch(/^private/);
        expect(await fetchClip('mari.mp3', { adminOf: [2] })).toBe('denied');
    });

    it('refuses it to a Santa in another group whose recipient has the same name', async () => {
        expect(await fetchClip('mari.mp3', { santa: 5 })).toBe('denied');
    });

    it('returns 404 for an unknown or invalid URL', async () => {
        expect(await fetchClip('nope.mp3', { adminOf: [1] })).toBe('denied');
    });
});
