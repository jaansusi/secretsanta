import { Controller, Get, Query, Redirect, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { UserService } from 'src/user/user.service';
import { resolveAdmin } from 'src/auth/admin.guard';
import { AdminRequest, endAdminSession, RETURN_TO_COOKIE } from 'src/auth/admin-session';

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
        const target = typeof next === 'string' && /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : '/admin';
        request.res?.cookie(RETURN_TO_COOKIE, target, { maxAge: 10 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    }

    @Get('logout')
    @Redirect('/admin')
    logout(@Req() request: AdminRequest) {
        if (request.res) {
            endAdminSession(request.res);
        }
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
