import { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense in depth, on top of SameSite=Lax session cookies: a state-changing request
 * (POST/PUT/PATCH/DELETE) is rejected when the browser says it came from another site.
 * Browsers send `Origin` on every cross-origin POST and `Sec-Fetch-Site` on all requests;
 * non-browser clients that send neither are let through, since they carry no ambient cookies.
 *
 * `Origin: null` is ambiguous: browsers send it for same-origin form posts when the
 * Referrer-Policy is no-referrer (as here), but also from sandboxed/cross-site contexts. In that
 * case the decision falls to Sec-Fetch-Site, which the browser sets and pages cannot override.
 */
export function originCheck(allowedOrigin: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (SAFE_METHODS.has(req.method)) {
            return next();
        }
        const origin = req.get('origin');
        if (origin !== undefined && origin !== 'null') {
            if (origin !== allowedOrigin) {
                return res.status(403).json({ statusCode: 403, message: 'Cross-origin request rejected' });
            }
            return next();
        }
        const fetchSite = req.get('sec-fetch-site');
        if (origin === 'null' && fetchSite !== 'same-origin') {
            return res.status(403).json({ statusCode: 403, message: 'Cross-site request rejected' });
        }
        if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') {
            return res.status(403).json({ statusCode: 403, message: 'Cross-site request rejected' });
        }
        next();
    };
}
