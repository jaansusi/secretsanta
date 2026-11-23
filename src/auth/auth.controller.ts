import { GoogleOAuthGuard } from './google-oauth.guard';
import { Controller, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { ADMIN_RETURN_PATH, endAdminSession, RETURN_TO_COOKIE, startAdminSession } from './admin-session';
import { SessionService } from './session.service';
import { GoogleUser } from './google.strategy';
import { SettingsService } from 'src/settings/settings.service';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly analyticsService: AnalyticsService,
        private readonly sessionService: SessionService,
        private readonly settingsService: SettingsService,
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
            const signIn = await this.authService.signInWithGoogle(req.user as GoogleUser | undefined);
            if (signIn == null) {
                await this.analyticsService.track('login_failed', req);
                target = adminReturn ? '/admin?error=unknown' : '/';
            } else {
                // Only groups that are not disabled can be signed in to. Stay in the group of the current session
                // when it is one of them; else the first one.
                const enabled = signIn.memberships.filter(member => this.settingsService.isGroupEnabled(member.groupId));
                const currentId = this.sessionService.readUserId(req);
                const user = enabled.find(member => member.id === currentId) ?? enabled[0];
                if (user) {
                    this.sessionService.start(res, user);
                }
                this.sessionService.rememberGoogleIdentity(res, signIn.email);
                // Admin access does not depend on the group being enabled: admins can still manage a disabled group.
                const mayAdmin = signIn.isSuperAdmin || signIn.memberships.some(member => member.isAdmin);
                if (mayAdmin) {
                    startAdminSession(res, signIn.email);
                }
                await this.analyticsService.track(user ? 'login_google' : 'login_failed', req, { userId: user?.id ?? null });
                if (adminReturn) {
                    target = mayAdmin ? adminReturn : '/admin?error=forbidden';
                } else if (enabled.length > 1) {
                    target = '/grupp';
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
