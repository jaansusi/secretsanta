import { join } from 'node:path';

/**
 * Folder where `yarn santa-audio` writes mp3s. The app no longer plays from here: on startup the files are
 * imported into the database (see SantaAudioImport) and served from /santa-audio.
 */
export const CLIPS_DIR = join(__dirname, '..', '..', 'public', 'audio', 'santa');

/** "Mari-Liis Õunapuu" -> "mari-liis-ounapuu". Keep in sync with slug() in scripts/santa-audio/generate.mjs. */
export function santaSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[õö]/g, 'o').replace(/ä/g, 'a').replace(/ü/g, 'u').replace(/š/g, 's').replace(/ž/g, 'z')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
