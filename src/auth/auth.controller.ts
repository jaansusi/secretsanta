import { GoogleOAuthGuard } from './google-oauth.guard';
import { Controller, Get, UseGuards, Req, Redirect } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { endAdminSession, RETURN_TO_COOKIE, startAdminSession } from './admin-session';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly analyticsService: AnalyticsService,
    ) { }

    @Get('google')
    @UseGuards(GoogleOAuthGuard)
    async googleAuth() { }

    @Get('google-redirect')
    @UseGuards(GoogleOAuthGuard)
    @Redirect('/')
    async googleAuthRedirect(@Req() req: Request): Promise<any> {
        const returnTo = req.cookies?.[RETURN_TO_COOKIE];
        const adminReturn = typeof returnTo === 'string' && returnTo.startsWith('/admin') ? returnTo : null;
        if (req.res && returnTo) {
            req.res.clearCookie(RETURN_TO_COOKIE);
        }
        try {
            const user = await this.authService.getUserWithGoogleLogin(req);
            if (req.res == null || user == null) {
                await this.analyticsService.track('login_failed', req);
                return adminReturn ? { url: '/admin?error=unknown' } : { result: 'Authentication failed.' };
            }
            req.res.cookie('santa_auth', user.id, { maxAge: 5184000000, httpOnly: false });
            req.res.cookie('santa_auth_provider', 'google', { maxAge: 5184000000, httpOnly: false });
            if (user.isAdmin) {
                startAdminSession(req.res, user);
            }
            await this.analyticsService.track('login_google', req, { userId: user.id });
            if (adminReturn) {
                return { url: user.isAdmin ? adminReturn : '/admin?error=forbidden' };
            }
            return { result: user.giftingTo, success: true };
        } catch (error) {
            return { result: error.message };
        }
    }

    @Get('logout')
    @Redirect('/')
    async logout(@Req() req: Request) {
        if (req.res == null) {
            return { success: false };
        }
        req.res.clearCookie('santa_auth');
        req.res.clearCookie('santa_auth_provider');
        endAdminSession(req.res);
        return { success: true };
    }
}
