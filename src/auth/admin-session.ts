import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';
import { User } from 'src/user/entities/user.entity';
import { baseCookieOptions, parseSessionValue } from './session.service';

/**
 * The admin panel uses its own signed, httpOnly cookie, issued only after a Google sign-in by an admin.
 * A participant session (santa_session, which a personal code link also grants) never gives admin access,
 * so a leaked link cannot be used to reach the panel.
 */
export const ADMIN_COOKIE = 'santa_admin';
/** Where to send the browser after Google sign-in, set when sign-in starts from the admin panel. */
export const RETURN_TO_COOKIE = 'santa_return_to';
/** Admin sessions are shorter than participant ones; signing in again is one click through Google. */
const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Paths inside the admin panel that sign-in may return to. */
export const ADMIN_RETURN_PATH = /^\/admin(\/[\w\-/]*)?$/;

export function startAdminSession(response: Response, user: User) {
    // `<userId>.<expiresAtMs>`, signed: expiry is enforced server-side, not only by the browser.
    response.cookie(ADMIN_COOKIE, `${user.id}.${Date.now() + ADMIN_SESSION_MAX_AGE}`, {
        ...baseCookieOptions(),
        signed: true,
        maxAge: ADMIN_SESSION_MAX_AGE,
    });
}

export function endAdminSession(response: Response) {
    response.clearCookie(ADMIN_COOKIE, baseCookieOptions());
}

/** The user id from a valid, unexpired admin cookie, or null when missing, tampered with or expired. */
export function adminSessionUserId(request: Request): number | null {
    return parseSessionValue(request.signedCookies?.[ADMIN_COOKIE]);
}

/** Request property where AdminGuard leaves the signed-in admin. */
export interface AdminRequest extends Request {
    admin?: User;
}

/** Injects the signed-in admin user into a handler guarded by AdminGuard. */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext): User | undefined => {
    return context.switchToHttp().getRequest<AdminRequest>().admin;
});
