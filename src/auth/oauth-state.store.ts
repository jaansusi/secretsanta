import { randomBytes, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { baseCookieOptions } from './session.service';

export const OAUTH_STATE_COOKIE = 'santa_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (err: Error | null, ok: string | false, info?: { message: string }) => void;

/**
 * passport-oauth2 state store that keeps the OAuth `state` and PKCE `code_verifier` in a short-lived,
 * signed, httpOnly cookie instead of a server-side session. This binds the Google callback to the
 * browser that started the login, which blocks login CSRF (an attacker completing the OAuth dance
 * with their own account in the victim's browser) and authorization-code injection.
 *
 * passport-oauth2 dispatches on Function.length, so the parameter lists below must stay as they are:
 * store(req, verifier, state, meta, cb) and verify(req, state, meta, cb).
 */
export class SignedCookieStateStore {
    store(req: Request, verifier: string, _state: unknown, _meta: unknown, callback: StoreCallback): void {
        if (!req.res) {
            return callback(new Error('OAuth state store needs an Express response'));
        }
        const handle = randomBytes(24).toString('base64url');
        req.res.cookie(OAUTH_STATE_COOKIE, JSON.stringify({ handle, verifier }), {
            ...baseCookieOptions(),
            path: '/auth',
            signed: true,
            maxAge: STATE_TTL_MS,
        });
        callback(null, handle);
    }

    verify(req: Request, providedState: unknown, _meta: unknown, callback: VerifyCallback): void {
        const raw: unknown = req.signedCookies?.[OAUTH_STATE_COOKIE];
        req.res?.clearCookie(OAUTH_STATE_COOKIE, { ...baseCookieOptions(), path: '/auth' });

        const fail = () => callback(null, false, { message: 'Invalid or expired OAuth state.' });
        if (typeof raw !== 'string' || typeof providedState !== 'string') {
            return fail();
        }
        let saved: { handle?: unknown; verifier?: unknown };
        try {
            saved = JSON.parse(raw);
        } catch {
            return fail();
        }
        if (typeof saved.handle !== 'string' || typeof saved.verifier !== 'string') {
            return fail();
        }
        const expected = Buffer.from(saved.handle);
        const actual = Buffer.from(providedState);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
            return fail();
        }
        callback(null, saved.verifier);
    }
}
