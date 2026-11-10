import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CookieOptions, Request, Response } from 'express';
import { User } from 'src/user/entities/user.entity';
import { isSecureDeployment } from 'src/config/env';

/** Name of the signed participant session cookie. Admin access uses its own cookie (admin-session.ts). */
export const SESSION_COOKIE = 'santa_session';
/** Cookies used before sessions were signed. They are ignored and cleared on sight. */
export const LEGACY_COOKIES = ['santa_auth', 'santa_auth_provider', 'santa_google'];

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Options shared by every cookie the app sets. */
export function baseCookieOptions(): CookieOptions {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureDeployment(),
        path: '/',
    };
}

/**
 * Parses a signed session value `<userId>.<expiresAtMs>` (already verified by cookie-parser).
 * Returns null for a missing or tampered cookie (`false`), a malformed value or an expired session.
 */
export function parseSessionValue(raw: unknown): number | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const match = /^(\d{1,10})\.(\d{1,15})$/.exec(raw);
    if (!match) {
        return null;
    }
    const userId = Number(match[1]);
    const expiresAt = Number(match[2]);
    if (!Number.isSafeInteger(userId) || userId <= 0 || expiresAt <= Date.now()) {
        return null;
    }
    return userId;
}

/**
 * Participant session. Stateless: the cookie holds `<userId>.<expiresAtMs>` and is HMAC-signed by cookie-parser
 * with COOKIE_SECRET, so it cannot be forged or edited. Expiry is enforced here, not only by the
 * browser. Authorization (isAdmin, existence) is always re-read from the database on each request.
 */
@Injectable()
export class SessionService {
    constructor(@InjectModel(User) private readonly users: typeof User) { }

    /** The user id from a valid, unexpired session cookie, or null. */
    public readUserId(request: Request): number | null {
        return parseSessionValue(request.signedCookies?.[SESSION_COOKIE]);
    }

    /** The logged-in user, freshly loaded from the database, or null. */
    public async getUser(request: Request): Promise<User | null> {
        const userId = this.readUserId(request);
        if (userId === null) {
            return null;
        }
        return this.users.findByPk(userId);
    }

    public start(response: Response, user: Pick<User, 'id'>): void {
        const expiresAt = Date.now() + SESSION_TTL_MS;
        response.cookie(SESSION_COOKIE, `${user.id}.${expiresAt}`, {
            ...baseCookieOptions(),
            signed: true,
            maxAge: SESSION_TTL_MS,
        });
        this.clearLegacy(response);
    }

    public end(response: Response): void {
        response.clearCookie(SESSION_COOKIE, baseCookieOptions());
        this.clearLegacy(response);
    }

    private clearLegacy(response: Response): void {
        for (const name of LEGACY_COOKIES) {
            response.clearCookie(name, { path: '/' });
        }
    }
}
