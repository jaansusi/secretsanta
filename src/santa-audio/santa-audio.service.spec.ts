import { Logger } from '@nestjs/common';
import { SantaAudioService } from './santa-audio.service';
import * as elevenLabs from './eleven-labs';
import { sendBinary } from 'src/common/send-binary';

/** In-memory stand-ins for the three Sequelize models the service uses. */
function setup() {
    let nextId = 100;
    const lines: any[] = [
        { id: 1, kind: 'intro', position: 1, text: 'Ho-ho-hoo!' },
        { id: 2, kind: 'name', position: 1, text: 'Sinu sihtmärk on {name}.' },
        { id: 3, kind: 'name', position: 2, text: 'Nimi on {name}.' },
        { id: 4, kind: 'outro', position: 1, text: 'Edu, agent!' },
    ];
    const clips: any[] = [];
    const users: any[] = [{ id: 10, name: 'Mari' }, { id: 11, name: 'Jüri' }];
    const matches = (row: any, where: any = {}) => Object.entries(where).every(([key, value]) => (row[key] ?? null) === value);
    const repo = (rows: any[]) => ({
        findAll: async (options: any = {}) => rows.filter(row => matches(row, options.where))
            .sort((a, b) => (a.kind ?? '').localeCompare(b.kind ?? '') || (a.position ?? 0) - (b.position ?? 0)),
        findOne: async (options: any) => rows.find(row => matches(row, options.where)) ?? null,
        findByPk: async (id: number) => rows.find(row => row.id === id) ?? null,
        create: async (values: any) => { const row = { id: nextId++, ...values }; rows.push(row); return row; },
        update: async (values: any, options: any) => rows.filter(row => matches(row, options.where)).forEach(row => Object.assign(row, values)),
        destroy: async (options: any) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], options.where)) rows.splice(i, 1); },
        max: async (field: string, options: any) => Math.max(0, ...rows.filter(row => matches(row, options.where)).map(row => row[field])),
        count: async () => rows.length,
    });
    const audit = { log: jest.fn() };
    const service = new SantaAudioService(repo(lines) as any, repo(clips) as any, repo(users) as any, audit as any, new Logger());
    return { service, lines, clips, users, audit };
}

const actor = { id: 1, name: 'Admin' };

async function waitForJob(service: SantaAudioService) {
    for (let i = 0; i < 100 && service.jobState()?.running; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
    }
}

describe('SantaAudioService', () => {
    beforeEach(() => {
        process.env.ELEVENLABS_API_KEY = 'test-key';
        process.env.ELEVENLABS_VOICE_ID = 'voice';
        jest.spyOn(elevenLabs, 'synthesize').mockImplementation(async (_config, text) => Buffer.from(`mp3:${text}`));
    });
    afterEach(() => jest.restoreAllMocks());

    it('plans one clip per intro/outro and one per name line and participant', async () => {
        const { service } = setup();
        const preview = await service.preview({ scope: 'outdated' });
        expect(preview.clips).toBe(1 + 2 * 2 + 1);
        const items = await service.plan({ scope: 'participant', userId: 11 });
        expect(items.map(item => item.text)).toEqual(['Sinu sihtmärk on Jüri.', 'Nimi on Jüri.']);
    });

    it('generates in the background and then only plays up-to-date clips', async () => {
        const { service, clips, audit } = setup();
        await service.start(actor, { scope: 'outdated' });
        await waitForJob(service);
        expect(service.jobState()).toMatchObject({ running: false, done: 6, failed: 0 });
        expect(clips.find(c => c.userId === 10 && c.lineId === 2).audio.toString()).toBe('mp3:Sinu sihtmärk on Mari.');
        expect(audit.log).toHaveBeenCalledWith(actor, expect.objectContaining({ action: 'audio.generate' }));

        const playlist = await service.playlist();
        expect(playlist.intros).toHaveLength(1);
        expect(playlist.intros[0]).toMatch(/^\/santa-audio\/\d+\.mp3\?v=\d+$/);
        expect(await service.nameClipUrls({ id: 10, name: 'Mari' } as any)).toHaveLength(2);
        expect((await service.plan({ scope: 'outdated' }))).toHaveLength(0);
    });

    it('marks clips out of date when the text or the name changes', async () => {
        const { service, users } = setup();
        await service.start(actor, { scope: 'outdated' });
        await waitForJob(service);
        await service.updateLine(actor, 1, 'Tere, agent!');
        users[0].name = 'Mari-Liis';
        const library = await service.library();
        expect(library.intros[0].status).toBe('stale');
        expect(library.participants.find(p => p.id === 10)!.clips.every(c => c.status === 'stale')).toBe(true);
        expect(library.summary).toMatchObject({ stale: 3, ready: 3, missing: 0 });
        expect((await service.playlist()).intros).toHaveLength(0);
        expect(await service.nameClipUrls(users[0])).toHaveLength(0);
    });

    it('keeps going when one clip fails and reports it', async () => {
        const { service } = setup();
        jest.spyOn(elevenLabs, 'synthesize').mockImplementation(async (_c, text) => {
            if (text.includes('Jüri')) throw new Error('quota exceeded');
            return Buffer.from('ok');
        });
        await service.start(actor, { scope: 'outdated' });
        await waitForJob(service);
        expect(service.jobState()).toMatchObject({ done: 4, failed: 2 });
        expect(service.jobState()!.errors[0]).toContain('quota exceeded');
    });

    it('validates line texts', async () => {
        const { service } = setup();
        await expect(service.createLine(actor, 'name', 'No placeholder')).rejects.toThrow('{name}');
        await expect(service.createLine(actor, 'intro', 'Hi {name}')).rejects.toThrow('Only name lines');
        await expect(service.createLine(actor, 'nope', 'x')).rejects.toThrow('kind');
        const line = await service.createLine(actor, 'outro', '  Head aega!  ');
        expect(line).toMatchObject({ text: 'Head aega!', position: 2 });
    });

    it('refuses to start without ElevenLabs configured', async () => {
        const { service } = setup();
        delete process.env.ELEVENLABS_API_KEY;
        await expect(service.start(actor, { scope: 'outdated' })).rejects.toThrow('ELEVENLABS_API_KEY');
    });
});

describe('sendBinary', () => {
    const data = Buffer.from('0123456789');
    const fake = (range?: string) => {
        const headers: Record<string, string> = {};
        const response: any = { statusCode: 200, body: null };
        response.setHeader = (k: string, v: string) => { headers[k] = v; return response; };
        response.status = (code: number) => { response.statusCode = code; return response; };
        response.end = (body?: Buffer) => { response.body = body ?? null; };
        sendBinary({ headers: { range } } as any, response, data, 'audio/mpeg', 'no-store');
        return { response, headers };
    };

    it('sends everything without a range', () => {
        const { response, headers } = fake();
        expect(response.statusCode).toBe(200);
        expect(response.body.toString()).toBe('0123456789');
        expect(headers['Accept-Ranges']).toBe('bytes');
    });

    it('answers byte ranges with 206', () => {
        expect(fake('bytes=0-1').response.body.toString()).toBe('01');
        const { response, headers } = fake('bytes=7-');
        expect(response.statusCode).toBe(206);
        expect(response.body.toString()).toBe('789');
        expect(headers['Content-Range']).toBe('bytes 7-9/10');
        expect(fake('bytes=-3').response.body.toString()).toBe('789');
        expect(fake('bytes=20-').response.statusCode).toBe(416);
    });
});
