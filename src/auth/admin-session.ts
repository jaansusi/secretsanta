import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';
import { User } from 'src/user/entities/user.entity';

/**
 * The admin panel uses its own signed, httpOnly cookie. The public site's santa_auth cookie is a plain
 * user id that anyone could edit, so it is never trusted for admin access.
 */
export const ADMIN_COOKIE = 'santa_admin';
/** Where to send the browser after Google sign-in, set when sign-in starts from the admin panel. */
export const RETURN_TO_COOKIE = 'santa_return_to';
const ADMIN_SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function startAdminSession(response: Response, user: User) {
    response.cookie(ADMIN_COOKIE, String(user.id), {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: (process.env.HOST ?? '').startsWith('https://'),
        maxAge: ADMIN_SESSION_MAX_AGE,
    });
}

export function endAdminSession(response: Response) {
    response.clearCookie(ADMIN_COOKIE);
}

/** The user id from a valid admin cookie, or null when missing or tampered with. */
export function adminSessionUserId(request: Request): number | null {
    const raw = request.signedCookies?.[ADMIN_COOKIE];
    const id = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
    return Number.isFinite(id) ? id : null;
}

/** Request property where AdminGuard leaves the signed-in admin. */
export interface AdminRequest extends Request {
    admin?: User;
}

/** Injects the signed-in admin user into a handler guarded by AdminGuard. */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext): User | undefined => {
    return context.switchToHttp().getRequest<AdminRequest>().admin;
});
