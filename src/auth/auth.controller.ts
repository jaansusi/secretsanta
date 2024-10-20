import { GoogleOAuthGuard } from './google-oauth.guard';
import { Controller, Get, Render, UseGuards, Req, Res, Redirect } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Get('google')
    @UseGuards(GoogleOAuthGuard)
    async googleAuth(@Req() req: Request) { }

    @Get('google-redirect')
    @UseGuards(GoogleOAuthGuard)
    @Redirect('/')
    async googleAuthRedirect(@Req() req: Request): Promise<any> {
        try {
            const user = await this.authService.getUserWithGoogleLogin(req);
            req.res.cookie('santa_auth', user.id, { maxAge: 5184000000, httpOnly: false });
            req.res.cookie('santa_auth_provider', 'google', { maxAge: 5184000000, httpOnly: false });
            return { result: user.giftingTo, success: true };
        } catch (error) {
            return { result: error.message };
        }
    }

    @Get('logout')
    @Redirect('/')
    async logout(@Req() req: Request) {
        req.res.clearCookie('santa_auth');
        req.res.clearCookie('santa_google');
        return { success: true };
    }
}