import { Request, Response } from 'express';
import { baseCookieOptions } from './session.service';

/**
 * A signed cookie that holds an e-mail address Google has verified, as `<expiresAtMs>.<base64url email>`.
 * Rights that follow the person across groups (admin access, switching between one's own groups) are based on
 * this address, never on the e-mail stored on a participant row, which group admins can edit.
 */
export function setIdentityCookie(response: Response, name: string, email: string, maxAgeMs: number, path = '/') {
    const value = `${Date.now() + maxAgeMs}.${Buffer.from(email, 'utf8').toString('base64url')}`;
    response.cookie(name, value, { ...baseCookieOptions(), path, signed: true, maxAge: maxAgeMs });
}

/** The verified e-mail from a valid, unexpired identity cookie, or null when missing, tampered with or expired. */
export function readIdentityCookie(request: Request, name: string): string | null {
    return parseIdentityValue(request.signedCookies?.[name]);
}

export function parseIdentityValue(raw: unknown): string | null {
    if (typeof raw !== 'string') {
        return null;
    }
    const match = /^(\d{1,15})\.([A-Za-z0-9_-]{1,700})$/.exec(raw);
    if (!match || Number(match[1]) <= Date.now()) {
        return null;
    }
    const email = Buffer.from(match[2], 'base64url').toString('utf8');
    return email.includes('@') ? email : null;
}
