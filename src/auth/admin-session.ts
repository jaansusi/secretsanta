import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';
import { User } from 'src/user/entities/user.entity';
import { Group } from 'src/group/entities/group.entity';
import { baseCookieOptions } from './session.service';
import { readIdentityCookie, setIdentityCookie } from './identity-cookie';

/**
 * The admin panel uses its own signed, httpOnly cookie, issued only after a Google sign-in by an admin.
 * A participant session (santa_session, which a personal code link also grants) never gives admin access,
 * so a leaked link cannot be used to reach the panel. The cookie holds the e-mail address Google verified;
 * which groups it may administer is worked out from that on every request (AdminAccessService).
 */
export const ADMIN_COOKIE = 'santa_admin';
/** The group the admin is working on in the panel (signed; only honoured if the admin may manage it). */
export const ADMIN_GROUP_COOKIE = 'santa_admin_group';
/** Where to send the browser after Google sign-in, set when sign-in starts from the admin panel. */
export const RETURN_TO_COOKIE = 'santa_return_to';
/** Admin sessions are shorter than participant ones; signing in again is one click through Google. */
const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Paths inside the admin panel that sign-in may return to. */
export const ADMIN_RETURN_PATH = /^\/admin(\/[\w\-/]*)?$/;

export function startAdminSession(response: Response, verifiedEmail: string) {
    // Expiry is inside the signed value, so it is enforced server-side, not only by the browser.
    setIdentityCookie(response, ADMIN_COOKIE, verifiedEmail, ADMIN_SESSION_MAX_AGE);
}

export function endAdminSession(response: Response) {
    response.clearCookie(ADMIN_COOKIE, baseCookieOptions());
    response.clearCookie(ADMIN_GROUP_COOKIE, baseCookieOptions());
}

/** The verified e-mail from a valid, unexpired admin cookie, or null when missing, tampered with or expired. */
export function adminSessionEmail(request: Request): string | null {
    return readIdentityCookie(request, ADMIN_COOKIE);
}

export function selectAdminGroup(response: Response, groupId: number) {
    response.cookie(ADMIN_GROUP_COOKIE, String(groupId), { ...baseCookieOptions(), signed: true, maxAge: ADMIN_SESSION_MAX_AGE });
}

export function selectedAdminGroupId(request: Request): number | null {
    const raw = request.signedCookies?.[ADMIN_GROUP_COOKIE];
    return typeof raw === 'string' && /^\d{1,10}$/.test(raw) ? Number(raw) : null;
}

/** Who is signed in to the admin panel and which group they are working on. */
export interface AdminContext {
    /** Verified Google e-mail of the signed-in admin. */
    email: string;
    /** ADMIN_EMAIL: manages every group, the groups themselves and the shared content. */
    isSuperAdmin: boolean;
    /** The group being managed. Every admin API call works on this group only. */
    group: Group;
    /** Every group this admin may switch to. */
    groups: Group[];
    /**
     * The admin as recorded in the audit log: their participant row in the current group, or (a super admin
     * who is not a participant there) their row in another group.
     */
    actor: User;
}

/** Request property where AdminGuard leaves the admin context. */
export interface AdminRequest extends Request {
    adminContext?: AdminContext;
}

/** Injects the signed-in admin (the audit actor) into a handler guarded by AdminGuard. */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext): User | undefined => {
    return context.switchToHttp().getRequest<AdminRequest>().adminContext?.actor;
});

/** Injects the id of the group the admin is working on into a handler guarded by AdminGuard. */
export const CurrentGroupId = createParamDecorator((_data: unknown, context: ExecutionContext): number | undefined => {
    return context.switchToHttp().getRequest<AdminRequest>().adminContext?.group.id;
});

/** Injects the whole admin context into a handler guarded by AdminGuard. */
export const CurrentAdminContext = createParamDecorator((_data: unknown, context: ExecutionContext): AdminContext | undefined => {
    return context.switchToHttp().getRequest<AdminRequest>().adminContext;
});
