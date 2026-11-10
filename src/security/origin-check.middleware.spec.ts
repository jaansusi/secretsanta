import { originCheck } from './origin-check.middleware';

describe('originCheck', () => {
    const middleware = originCheck('https://santa.example.com');

    function run(method: string, headers: Record<string, string>) {
        const req = { method, get: (name: string) => headers[name.toLowerCase()] };
        const json = jest.fn();
        const res = { status: jest.fn(() => ({ json })) };
        const next = jest.fn();
        middleware(req as any, res as any, next);
        return { allowed: next.mock.calls.length === 1, status: (res.status.mock.calls[0] as any)?.[0] };
    }

    it('lets safe methods through from anywhere', () => {
        expect(run('GET', { origin: 'https://evil.example' }).allowed).toBe(true);
    });

    it('allows same-origin unsafe requests', () => {
        expect(run('POST', { origin: 'https://santa.example.com' }).allowed).toBe(true);
        expect(run('DELETE', { 'sec-fetch-site': 'same-origin' }).allowed).toBe(true);
    });

    it('rejects cross-origin unsafe requests', () => {
        expect(run('POST', { origin: 'https://evil.example' })).toEqual({ allowed: false, status: 403 });
        expect(run('DELETE', { 'sec-fetch-site': 'cross-site' })).toEqual({ allowed: false, status: 403 });
        expect(run('POST', { 'sec-fetch-site': 'same-site' })).toEqual({ allowed: false, status: 403 });
    });

    it('decides Origin: null by Sec-Fetch-Site (same-origin form post under no-referrer)', () => {
        expect(run('POST', { origin: 'null', 'sec-fetch-site': 'same-origin' }).allowed).toBe(true);
        expect(run('POST', { origin: 'null', 'sec-fetch-site': 'cross-site' })).toEqual({ allowed: false, status: 403 });
        expect(run('POST', { origin: 'null' })).toEqual({ allowed: false, status: 403 });
    });

    it('allows non-browser clients that send neither header', () => {
        expect(run('POST', {}).allowed).toBe(true);
    });
});
