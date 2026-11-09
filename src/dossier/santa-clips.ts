import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Santa's briefing is assembled from pre-generated clips in public/audio/santa (see scripts/santa-audio):
 * intro-NN.mp3 and outro-NN.mp3 shared by everyone, and name-<slug>-N.mp3 per participant.
 * The browser picks which intro/outro to play; the server only reports what exists.
 */
export const SANTA_CLIPS_URL = '/audio/santa';
const CLIPS_DIR = join(__dirname, '..', '..', 'public', 'audio', 'santa');

export interface SantaClipLibrary {
    intros: number;
    outros: number;
    /** URLs of the recipient's name clips, in variant order. Empty when none were generated. */
    names: string[];
}

/** "Mari-Liis Õunapuu" -> "mari-liis-ounapuu". Keep in sync with slug() in scripts/santa-audio/generate.mjs. */
export function santaSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[õö]/g, 'o').replace(/ä/g, 'a').replace(/ü/g, 'u').replace(/š/g, 's').replace(/ž/g, 'z')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function readSantaClipLibrary(recipientName?: string): SantaClipLibrary {
    let files: string[];
    try {
        files = readdirSync(CLIPS_DIR);
    } catch {
        return { intros: 0, outros: 0, names: [] };
    }
    const intros = files.filter(file => /^intro-\d+\.mp3$/.test(file)).length;
    const outros = files.filter(file => /^outro-\d+\.mp3$/.test(file)).length;
    let names: string[] = [];
    if (recipientName) {
        const slug = santaSlug(recipientName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^name-${slug}-\\d+\\.mp3$`);
        names = files.filter(file => pattern.test(file)).sort().map(file => `${SANTA_CLIPS_URL}/${file}`);
    }
    return { intros, outros, names };
}
