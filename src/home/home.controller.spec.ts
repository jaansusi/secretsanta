import { HomeController } from './home.controller';

describe('HomeController', () => {
    const userService = { getByDecryptionCode: jest.fn(), getByName: jest.fn(), getById: jest.fn() };
    const encryptionService = { decryptGiftingTo: jest.fn() };
    const dossierService = { getClipPlaylist: async () => ({ intros: [], outros: [] }), getRevealDossier: jest.fn() };
    const analyticsService = { track: jest.fn() };
    const settingsService = { get: () => ({ revealOpen: true, revealClosedMessage: 'closed' }) };
    const sessionService = { start: jest.fn(), getUser: jest.fn(), readUserId: jest.fn() };
    const logger = { error: jest.fn() };
    const controller = new HomeController(
        userService as any, encryptionService as any, dossierService as any, analyticsService as any,
        settingsService as any, sessionService as any, logger as any,
    );

    const response = () => ({ render: jest.fn(), redirect: jest.fn(), cookie: jest.fn() });
    const request = (query: object = {}) => ({ query, cookies: {}, signedCookies: {} }) as any;

    beforeEach(() => jest.clearAllMocks());

    it('trades a valid ?code= for a session and redirects so the code leaves the URL', async () => {
        userService.getByDecryptionCode.mockResolvedValue({ id: 9 });
        const res = response();
        await controller.home(request({ code: 'c'.repeat(26) }), res as any);
        expect(sessionService.start).toHaveBeenCalledWith(res, { id: 9 });
        expect(res.redirect).toHaveBeenCalledWith(303, '/');
        expect(res.render).not.toHaveBeenCalled();
    });

    it('shows an error for an unknown code without starting a session', async () => {
        userService.getByDecryptionCode.mockResolvedValue(null);
        const res = response();
        await controller.home(request({ code: ['x'] }), res as any);
        expect(sessionService.start).not.toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('index', expect.objectContaining({ error: 'Vigane kood!' }));
    });

    it('never trusts the legacy unsigned santa_auth cookie', async () => {
        sessionService.getUser.mockResolvedValue(null);
        const res = response();
        await controller.home({ query: {}, cookies: { santa_auth: '1' }, signedCookies: {} } as any, res as any);
        const [, locals] = res.render.mock.calls[0];
        expect(locals.loggedIn).toBeUndefined();
        expect(locals.prefill).toBeUndefined();
    });

    it('rejects a non-string code in the reveal request', async () => {
        const res = response();
        expect(await controller.showResult(request(), { code: ['a', 'b'] }, res as any)).toEqual({ error: 'Vigane päring!' });
        expect(await controller.showResult(request(), { code: { $ne: '' } }, res as any)).toEqual({ error: 'Vigane päring!' });
        expect(userService.getByDecryptionCode).not.toHaveBeenCalled();
    });

    it('does not leak internal error details on a failed reveal', async () => {
        userService.getByDecryptionCode.mockResolvedValue({ id: 2 });
        encryptionService.decryptGiftingTo.mockImplementation(() => { throw new Error('bad decrypt: secret detail'); });
        const result: any = await controller.showResult(request(), { code: 'c'.repeat(26) }, response() as any);
        expect(result.error).toMatch(/^Viga!/);
        expect(JSON.stringify(result)).not.toContain('secret detail');
    });
});
