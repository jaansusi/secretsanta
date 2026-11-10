export interface ParsedUserAgent {
    device: 'mobile' | 'tablet' | 'desktop';
    browser: string;
    os: string;
}

/** Link-preview fetchers (Messenger, WhatsApp, Slack...) open shared links too; they are not people. */
const BOT_PATTERN = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|embedly|curl|wget|python-requests|headless/i;

export function isBot(userAgent: string | undefined): boolean {
    return !userAgent || BOT_PATTERN.test(userAgent);
}

/** A deliberately small parser: enough to tell phones from laptops and in-app browsers from real ones. */
export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
    const ua = userAgent ?? '';
    let device: ParsedUserAgent['device'] = 'desktop';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
        device = 'tablet';
    } else if (/Mobi|iPhone|iPod|Android/i.test(ua)) {
        device = 'mobile';
    }

    let browser = 'Other';
    if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = 'Facebook app';
    else if (/Instagram/i.test(ua)) browser = 'Instagram app';
    else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
    else if (/Firefox|FxiOS/i.test(ua)) browser = 'Firefox';
    else if (/Chrome|CriOS/i.test(ua)) browser = 'Chrome';
    else if (/Safari/i.test(ua)) browser = 'Safari';

    let os = 'Other';
    if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Linux|CrOS/i.test(ua)) os = 'Linux';

    return { device, browser, os };
}
