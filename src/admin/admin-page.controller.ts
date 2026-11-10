import { Controller, Get, Post, Query, Redirect, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { UserService } from 'src/user/user.service';
import { resolveAdmin } from 'src/auth/admin.guard';
import { ADMIN_RETURN_PATH, AdminRequest, endAdminSession, RETURN_TO_COOKIE } from 'src/auth/admin-session';
import { baseCookieOptions } from 'src/auth/session.service';

const LOGIN_ERRORS: Record<string, string> = {
    forbidden: 'That Google account is not an admin.',
    unknown: 'That Google account is not registered as a participant.',
};

/**
 * Serves the admin panel. It is a single page app: every /admin/* path gets the same shell
 * and the browser renders the page. Data comes from /api/admin/*.
 */
@Controller('admin')
export class AdminPageController {
    constructor(private readonly userService: UserService) { }

    @Get('login')
    @Redirect('/auth/google')
    login(@Req() request: AdminRequest, @Query('next') next?: string) {
        const target = typeof next === 'string' && ADMIN_RETURN_PATH.test(next) ? next : '/admin';
        // Signed so it cannot be planted, and re-validated when it is read after sign-in.
        request.res?.cookie(RETURN_TO_COOKIE, target, { ...baseCookieOptions(), signed: true, maxAge: 10 * 60 * 1000 });
    }

    /** POST so that a cross-site link or image cannot sign the admin out. */
    @Post('logout')
    logout(@Res() response: Response) {
        endAdminSession(response);
        response.redirect(303, '/admin');
    }

    @Get(['', '*path'])
    async app(@Req() request: AdminRequest, @Res() response: Response, @Query('error') error?: string) {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Frame-Options', 'DENY');
        response.setHeader('Referrer-Policy', 'same-origin');
        const admin = await resolveAdmin(request, this.userService);
        if (!admin) {
            return response.render('admin/login', {
                error: error ? LOGIN_ERRORS[error] ?? 'Sign-in failed.' : null,
                next: request.path,
            });
        }
        return response.render('admin/app', { adminName: admin.name });
    }
}
