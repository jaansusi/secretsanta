import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Runs the Google OAuth flow. No offline access is requested: the app only needs the
 * verified email at login time, never a refresh token.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
    constructor() {
        super({ session: false });
    }
}
