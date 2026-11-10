import { GoogleOAuthGuard } from './google-oauth.guard';
import { Controller, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { ADMIN_RETURN_PATH, endAdminSession, RETURN_TO_COOKIE, startAdminSession } from './admin-session';
import { SessionService } from './session.service';
import { GoogleUser } from './google.strategy';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly analyticsService: AnalyticsService,
        private readonly sessionService: SessionService,
        private readonly logger: Logger,
    ) { }

    @Get('google')
    @UseGuards(GoogleOAuthGuard)
    googleAuth() {
        // The guard redirects to Google.
    }

    @Get('google-redirect')
    @UseGuards(GoogleOAuthGuard)
    async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
        const returnTo = req.signedCookies?.[RETURN_TO_COOKIE];
        const adminReturn = typeof returnTo === 'string' && ADMIN_RETURN_PATH.test(returnTo) ? returnTo : null;
        res.clearCookie(RETURN_TO_COOKIE);
        let target = '/';
        try {
            const user = await this.authService.getUserWithGoogleLogin(req.user as GoogleUser | undefined);
            if (user == null) {
                await this.analyticsService.track('login_failed', req);
                target = adminReturn ? '/admin?error=unknown' : '/';
            } else {
                this.sessionService.start(res, user);
                if (user.isAdmin) {
                    startAdminSession(res, user);
                }
                await this.analyticsService.track('login_google', req, { userId: user.id });
                if (adminReturn) {
                    target = user.isAdmin ? adminReturn : '/admin?error=forbidden';
                }
            }
        } catch (error) {
            this.logger.error(`Google login failed: ${error.message}`);
        }
        res.redirect(303, target);
    }

    /** POST so that a cross-site link or image cannot log people out. Ends the admin session too. */
    @Post('logout')
    logout(@Res() res: Response) {
        this.sessionService.end(res);
        endAdminSession(res);
        res.redirect(303, '/');
    }
}
