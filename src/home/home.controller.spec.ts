import { HomeController } from './home.controller';

describe('HomeController', () => {
    const userService = { getByDecryptionCode: jest.fn(), getByName: jest.fn(), getById: jest.fn(), getAllByEmail: jest.fn(async (): Promise<any[]> => []), agentName: jest.fn(async () => 'Agent Test') };
    const encryptionService = { decryptGiftingTo: jest.fn() };
    const dossierService = { getClipPlaylist: async () => ({ intros: [], outros: [] }), getRevealDossier: jest.fn() };
    const analyticsService = { track: jest.fn() };
    const disabledGroups = new Set<number>();
    const settingsService = {
        get: () => ({ revealOpen: true, revealClosedMessage: 'closed' }),
        letterUrl: jest.fn((groupId: number) => (groupId === 1 ? 'https://docs.google.com/document/d/own/preview' : '')),
        isGroupEnabled: (groupId: number) => !disabledGroups.has(groupId),
    };
    const sessionService = { start: jest.fn(), getUser: jest.fn(), readUserId: jest.fn(), googleIdentity: jest.fn((): string | null => null) };
    const adminAccess = { canManageGroup: jest.fn(async () => false) };
    const groupService = { get: jest.fn(), namesById: jest.fn(async () => new Map()) };
    const logger = { error: jest.fn() };
    const controller = new HomeController(
        userService as any, encryptionService as any, dossierService as any, analyticsService as any,
        settingsService as any, sessionService as any, adminAccess as any, groupService as any, logger as any,
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

    describe('&preview on a personal link', () => {
        it('names whose link it is without tracking or starting a session', async () => {
            userService.getByDecryptionCode.mockResolvedValue({ id: 9, groupId: 1, name: 'Mari', decryptionCode: 'c'.repeat(26) });
            groupService.get.mockResolvedValue({ name: 'Pere' });
            const res = response();
            await controller.home(request({ code: 'c'.repeat(26), preview: '' }), res as any);
            expect(analyticsService.track).not.toHaveBeenCalled();
            expect(sessionService.start).not.toHaveBeenCalled();
            expect(res.redirect).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('link-preview', expect.objectContaining({ userName: 'Mari', previewGroup: 'Pere', revealClosed: false }));
            expect(encryptionService.decryptGiftingTo).not.toHaveBeenCalled();
        });

        it('reports an unknown code without recording an invalid link', async () => {
            userService.getByDecryptionCode.mockResolvedValue(null);
            const res = response();
            await controller.home(request({ code: 'x'.repeat(26), preview: '1' }), res as any);
            expect(analyticsService.track).not.toHaveBeenCalled();
            expect(res.render).toHaveBeenCalledWith('link-preview', { invalid: true });
        });
    });

    it('never trusts the legacy unsigned santa_auth cookie', async () => {
        sessionService.getUser.mockResolvedValue(null);
        const res = response();
        await controller.home({ query: {}, cookies: { santa_auth: '1' }, signedCookies: {} } as any, res as any);
        const [, locals] = res.render.mock.calls[0];
        expect(locals.loggedIn).toBeUndefined();
        expect(locals.prefill).toBeUndefined();
    });

    describe("Santa's letter", () => {
        it("shows the envelope icon only when the participant's group has a letter", async () => {
            sessionService.getUser.mockResolvedValue({ id: 3, groupId: 2, name: 'Mari', encryptionStrategy: 'code', decryptionCode: 'x' });
            const none = response();
            await controller.home(request(), none as any);
            expect(none.render.mock.calls[0][1].showLetter).toBe(false);

            sessionService.getUser.mockResolvedValue({ id: 4, groupId: 1, name: 'Jaan', encryptionStrategy: 'code', decryptionCode: 'y' });
            const own = response();
            await controller.home(request(), own as any);
            expect(own.render.mock.calls[0][1].showLetter).toBe(true);
        });

        it('has no letter for visitors who are not signed in', async () => {
            sessionService.getUser.mockResolvedValue(null);
            const res = response();
            await controller.home(request(), res as any);
            expect(res.render.mock.calls[0][1].showLetter).toBeFalsy();
            expect(await controller.letter(request())).toEqual(expect.objectContaining({ letterUrl: '', showLetter: false }));
        });

        it("never shows a group without a letter another group's", async () => {
            sessionService.getUser.mockResolvedValue({ id: 3, groupId: 2, name: 'Mari' });
            expect(await controller.letter(request())).toEqual(expect.objectContaining({ letterUrl: '', showLetter: false }));
        });
    });

    it('rejects a non-string code in the reveal request', async () => {
        const res = response();
        expect(await controller.showResult(request(), { code: ['a', 'b'] }, res as any)).toEqual({ error: 'Vigane päring!' });
        expect(await controller.showResult(request(), { code: { $ne: '' } }, res as any)).toEqual({ error: 'Vigane päring!' });
        expect(userService.getByDecryptionCode).not.toHaveBeenCalled();
    });

    describe('switching group (/grupp)', () => {
        const mine = [{ id: 10, groupId: 1, name: 'Mari' }, { id: 20, groupId: 2, name: 'Mari' }];

        it("only switches to a participant row of the Google account this browser signed in with", async () => {
            sessionService.googleIdentity.mockReturnValue('mari@example.com');
            userService.getAllByEmail.mockResolvedValue(mine as any);
            const res = response();
            await controller.switchGroup(request(), { userId: '20' }, res as any);
            expect(sessionService.start).toHaveBeenCalledWith(res, mine[1]);

            sessionService.start.mockClear();
            await controller.switchGroup(request(), { userId: '99' }, response() as any);
            expect(sessionService.start).not.toHaveBeenCalled();
        });

        it('leaves disabled groups out of the selection and refuses to switch to them', async () => {
            sessionService.googleIdentity.mockReturnValue('mari@example.com');
            userService.getAllByEmail.mockResolvedValue([...mine, { id: 30, groupId: 3, name: 'Mari' }] as any);
            groupService.namesById.mockResolvedValue(new Map([[1, 'Family'], [2, 'Work'], [3, 'Old office']]));
            disabledGroups.add(3);
            try {
                const res = response();
                await controller.chooseGroup(request(), res as any);
                const [, locals] = res.render.mock.calls[0];
                expect(locals.choices.map((choice: any) => choice.groupName)).toEqual(['Family', 'Work']);

                await controller.switchGroup(request(), { userId: 30 }, response() as any);
                expect(sessionService.start).not.toHaveBeenCalled();

                // With only one group left to choose, there is no selection at all.
                disabledGroups.add(2);
                const single = response();
                await controller.chooseGroup(request(), single as any);
                expect(single.redirect).toHaveBeenCalledWith(303, '/');
            } finally {
                disabledGroups.clear();
            }
        });

        it('never switches after a personal code link (no Google identity)', async () => {
            sessionService.googleIdentity.mockReturnValue(null);
            userService.getAllByEmail.mockClear();
            await controller.switchGroup(request(), { userId: 20 }, response() as any);
            expect(sessionService.start).not.toHaveBeenCalled();
            expect(userService.getAllByEmail).not.toHaveBeenCalled();
        });

        it('looks the recipient up in the Santa\'s own group', async () => {
            userService.getByDecryptionCode.mockResolvedValue({ id: 5, groupId: 2, name: 'Mari' });
            encryptionService.decryptGiftingTo.mockReturnValue('Jaan');
            dossierService.getRevealDossier.mockResolvedValue({});
            await controller.showResult(request(), { code: 'c'.repeat(26) }, response() as any);
            expect(userService.getByName).toHaveBeenCalledWith(2, 'Jaan');
        });
    });

    it('does not leak internal error details on a failed reveal', async () => {
        userService.getByDecryptionCode.mockResolvedValue({ id: 2 });
        encryptionService.decryptGiftingTo.mockImplementation(() => { throw new Error('bad decrypt: secret detail'); });
        const result: any = await controller.showResult(request(), { code: 'c'.repeat(26) }, response() as any);
        expect(result.error).toMatch(/^Viga!/);
        expect(JSON.stringify(result)).not.toContain('secret detail');
    });
});
