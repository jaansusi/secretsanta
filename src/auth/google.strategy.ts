import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignedCookieStateStore } from './oauth-state.store';

/** The only data kept from the Google profile. OAuth tokens are discarded. */
export interface GoogleUser {
    email: string;
    firstName: string;
    lastName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor() {
        super({
            clientID: process.env.GOOGLE_CLIENT_ID ?? '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            callbackURL: new URL('/auth/google-redirect', process.env.HOST).toString(),
            scope: ['email', 'profile'],
            // state + PKCE, persisted in a signed cookie (see SignedCookieStateStore).
            state: true,
            pkce: true,
            store: new SignedCookieStateStore(),
        } as any);
    }

    async validate(_accessToken: string, _refreshToken: string, profile: Profile): Promise<GoogleUser> {
        // Only trust an address Google has verified, otherwise an account could claim someone else's email.
        const email = profile.emails?.find(entry => (entry as any).verified === true || (entry as any).verified === 'true');
        if (!email?.value) {
            throw new UnauthorizedException('Google account has no verified email address.');
        }
        return {
            email: email.value,
            firstName: profile.name?.givenName ?? '',
            lastName: profile.name?.familyName ?? '',
        };
    }
}
