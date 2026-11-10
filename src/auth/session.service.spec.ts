import { SESSION_COOKIE, SESSION_TTL_MS, SessionService } from './session.service';
import { ADMIN_COOKIE, adminSessionUserId, startAdminSession } from './admin-session';

function requestWith(signedCookies: Record<string, unknown>): any {
    return { signedCookies, cookies: {} };
}

describe('SessionService', () => {
    const users = { findByPk: jest.fn() };
    const service = new SessionService(users as any);

    beforeEach(() => {
        users.findByPk.mockReset();
        process.env.HOST = 'https://santa.example.com';
    });

    it('accepts a correctly signed, unexpired session', () => {
        const value = `42.${Date.now() + 60_000}`;
        expect(service.readUserId(requestWith({ [SESSION_COOKIE]: value }))).toBe(42);
    });

    it('rejects a cookie whose signature did not verify (cookie-parser yields false)', () => {
        expect(service.readUserId(requestWith({ [SESSION_COOKIE]: false }))).toBeNull();
    });

    it('rejects an expired session even if the browser still sends it', () => {
        const value = `42.${Date.now() - 1}`;
        expect(service.readUserId(requestWith({ [SESSION_COOKIE]: value }))).toBeNull();
    });

    it('rejects malformed values', () => {
        for (const value of ['42', 'abc.123', '-1.99999999999999', '0.99999999999999', `42.${Date.now() + 1000}.1`]) {
            expect(service.readUserId(requestWith({ [SESSION_COOKIE]: value }))).toBeNull();
        }
    });

    it('ignores the legacy unsigned santa_auth cookie (raw user id)', async () => {
        const request = { signedCookies: {}, cookies: { santa_auth: '1' } };
        expect(await service.getUser(request as any)).toBeNull();
        expect(users.findByPk).not.toHaveBeenCalled();
    });

    it('sets a signed, httpOnly, SameSite=Lax, Secure cookie on login', () => {
        const response = { cookie: jest.fn(), clearCookie: jest.fn() };
        service.start(response as any, { id: 5 } as any);
        const [name, value, options] = response.cookie.mock.calls[0];
        expect(name).toBe(SESSION_COOKIE);
        expect(value).toMatch(/^5\.\d+$/);
        expect(options).toMatchObject({ signed: true, httpOnly: true, sameSite: 'lax', secure: true, maxAge: SESSION_TTL_MS });
        expect(response.clearCookie).toHaveBeenCalledWith('santa_auth', expect.anything());
    });

    describe('admin session', () => {
        it('is separate from the participant session', () => {
            // A code link only ever creates santa_session, which must not count as admin.
            const request = requestWith({ [SESSION_COOKIE]: `1.${Date.now() + 60_000}` });
            expect(adminSessionUserId(request)).toBeNull();
        });

        it('rejects the old unexpiring format, tampered and expired values', () => {
            expect(adminSessionUserId(requestWith({ [ADMIN_COOKIE]: '1' }))).toBeNull();
            expect(adminSessionUserId(requestWith({ [ADMIN_COOKIE]: false }))).toBeNull();
            expect(adminSessionUserId(requestWith({ [ADMIN_COOKIE]: `1.${Date.now() - 1}` }))).toBeNull();
            expect(adminSessionUserId(requestWith({ [ADMIN_COOKIE]: `1.${Date.now() + 60_000}` }))).toBe(1);
        });

        it('is issued signed, httpOnly and with an expiry inside the value', () => {
            const response = { cookie: jest.fn() };
            startAdminSession(response as any, { id: 3 } as any);
            const [name, value, options] = response.cookie.mock.calls[0];
            expect(name).toBe(ADMIN_COOKIE);
            expect(value).toMatch(/^3\.\d+$/);
            expect(options).toMatchObject({ signed: true, httpOnly: true, sameSite: 'lax' });
        });
    });
});
