/**
 * Environment validation and derived settings. Called once at startup (main.ts) so that a
 * misconfigured deployment fails fast instead of running with insecure defaults.
 */

const MIN_SECRET_LENGTH = 32;
/** Values that have shipped as examples and must never be used as real secrets. */
const KNOWN_WEAK_SECRETS = new Set(['1234567890', 'secret', 'changeme', 'password']);

export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}

/** True when the public URL is https, so cookies get the Secure flag. */
export function isSecureDeployment(): boolean {
    return (process.env.HOST ?? '').toLowerCase().startsWith('https://');
}

/** The public origin of the app (scheme://host[:port]), derived from HOST. */
export function publicOrigin(): string | null {
    try {
        return new URL(process.env.HOST ?? '').origin;
    } catch {
        return null;
    }
}

/** The origin of an https URL (used for the letter's CSP frame-src), or null for anything else. */
export function httpsOrigin(link: string | undefined | null): string | null {
    if (!link) {
        return null;
    }
    try {
        const url = new URL(link);
        return url.protocol === 'https:' ? url.origin : null;
    } catch {
        return null;
    }
}

export function validateEnvironment(): string[] {
    const warnings: string[] = [];
    const errors: string[] = [];

    const secret = process.env.COOKIE_SECRET ?? '';
    if (!secret) {
        errors.push('COOKIE_SECRET is required (generate one with: openssl rand -base64 48).');
    } else if (secret.length < MIN_SECRET_LENGTH || KNOWN_WEAK_SECRETS.has(secret)) {
        const message = `COOKIE_SECRET must be a random value of at least ${MIN_SECRET_LENGTH} characters.`;
        if (isProduction()) {
            errors.push(message);
        } else {
            warnings.push(message);
        }
    }

    if (!publicOrigin()) {
        errors.push('HOST must be the absolute public URL of the app, e.g. https://santa.example.com');
    } else if (isProduction() && !isSecureDeployment()) {
        warnings.push('HOST is not https: session cookies will not get the Secure flag.');
    }

    if (process.env.GOOGLE_DOC_LETTER_LINK && !httpsOrigin(process.env.GOOGLE_DOC_LETTER_LINK)) {
        warnings.push('GOOGLE_DOC_LETTER_LINK must be an https URL; the letter page will not be able to embed it.');
    }

    if (errors.length > 0) {
        throw new Error('Invalid configuration:\n - ' + errors.join('\n - '));
    }
    return warnings;
}
