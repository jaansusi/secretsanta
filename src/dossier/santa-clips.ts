import { join } from 'node:path';

/**
 * Folder where `yarn santa-audio` writes mp3s. On startup the files are imported into the database (see
 * SantaAudioImport) and served from /santa-audio under signed URLs. It is deliberately outside public/:
 * name clips are named after participants (name-<slug>-N.mp3), so serving them statically would let anyone
 * guess and download them.
 */
export const CLIPS_DIR = join(__dirname, '..', '..', 'scripts', 'santa-audio', 'clips');

/** "Mari-Liis Õunapuu" -> "mari-liis-ounapuu". Keep in sync with slug() in scripts/santa-audio/generate.mjs. */
export function santaSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[õö]/g, 'o').replace(/ä/g, 'a').replace(/ü/g, 'u').replace(/š/g, 's').replace(/ž/g, 'z')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
