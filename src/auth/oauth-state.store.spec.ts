import { OAUTH_STATE_COOKIE, SignedCookieStateStore } from './oauth-state.store';

describe('SignedCookieStateStore', () => {
    const store = new SignedCookieStateStore();

    it('keeps the arities passport-oauth2 dispatches on', () => {
        expect(store.store.length).toBe(5);
        expect(store.verify.length).toBe(4);
    });

    function startLogin() {
        const res = { cookie: jest.fn(), clearCookie: jest.fn() };
        let handle = '';
        store.store({ res } as any, 'the-verifier', undefined, {}, (err, state) => {
            expect(err).toBeNull();
            handle = state as string;
        });
        const [name, value, options] = res.cookie.mock.calls[0];
        expect(name).toBe(OAUTH_STATE_COOKIE);
        expect(options).toMatchObject({ signed: true, httpOnly: true, sameSite: 'lax', path: '/auth' });
        return { handle, cookieValue: value as string };
    }

    function verify(signedCookie: unknown, state: unknown) {
        const res = { clearCookie: jest.fn() };
        const callback = jest.fn();
        store.verify({ res, signedCookies: { [OAUTH_STATE_COOKIE]: signedCookie } } as any, state, {}, callback);
        expect(res.clearCookie).toHaveBeenCalled();
        return callback.mock.calls[0];
    }

    it('returns the PKCE verifier when the state matches the cookie', () => {
        const { handle, cookieValue } = startLogin();
        expect(handle.length).toBeGreaterThanOrEqual(32);
        expect(verify(cookieValue, handle)).toEqual([null, 'the-verifier']);
    });

    it('fails when the state does not match (login CSRF / code injection)', () => {
        const { cookieValue } = startLogin();
        const [err, ok] = verify(cookieValue, 'attacker-state');
        expect(err).toBeNull();
        expect(ok).toBe(false);
    });

    it('fails when the cookie is missing or its signature is invalid', () => {
        const { handle } = startLogin();
        expect(verify(undefined, handle)[1]).toBe(false);
        expect(verify(false, handle)[1]).toBe(false);
    });

    it('fails on non-string state (e.g. ?state[]=x)', () => {
        const { cookieValue } = startLogin();
        expect(verify(cookieValue, ['x'])[1]).toBe(false);
    });
});
