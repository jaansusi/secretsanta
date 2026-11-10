import { DossierAssetKind } from './entities/dossier.entity';

/**
 * Detects the real type of an uploaded file from its leading bytes. The browser-supplied
 * Content-Type is attacker-controlled and is never trusted: only these formats are stored, and
 * the detected type (not the claimed one) is what gets served back. Notably SVG and HTML, which
 * can carry script, are not accepted.
 */
interface Signature {
    mime: string;
    kind: DossierAssetKind;
    matches: (b: Buffer) => boolean;
}

const ascii = (b: Buffer, offset: number, text: string) =>
    b.length >= offset + text.length && b.toString('latin1', offset, offset + text.length) === text;

const SIGNATURES: Signature[] = [
    { mime: 'image/jpeg', kind: 'photo', matches: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/png', kind: 'photo', matches: b => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { mime: 'image/gif', kind: 'photo', matches: b => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a') },
    { mime: 'image/webp', kind: 'photo', matches: b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP') },
    { mime: 'image/avif', kind: 'photo', matches: b => ascii(b, 4, 'ftypavif') || ascii(b, 4, 'ftypavis') },
    { mime: 'image/heic', kind: 'photo', matches: b => ascii(b, 4, 'ftypheic') || ascii(b, 4, 'ftypheix') || ascii(b, 4, 'ftypmif1') },

    { mime: 'audio/mpeg', kind: 'audio', matches: b => ascii(b, 0, 'ID3') || (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
    { mime: 'audio/ogg', kind: 'audio', matches: b => ascii(b, 0, 'OggS') },
    { mime: 'audio/wav', kind: 'audio', matches: b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE') },
    { mime: 'audio/flac', kind: 'audio', matches: b => ascii(b, 0, 'fLaC') },
    { mime: 'audio/webm', kind: 'audio', matches: b => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
    { mime: 'audio/mp4', kind: 'audio', matches: b => ascii(b, 4, 'ftypM4A') || ascii(b, 4, 'ftypmp4') || ascii(b, 4, 'ftypisom') },
];

/** The detected MIME type if the content is an allowed format for this kind of asset, otherwise null. */
export function detectAssetType(data: Buffer, kind: DossierAssetKind): string | null {
    const match = SIGNATURES.find(signature => signature.kind === kind && signature.matches(data));
    return match ? match.mime : null;
}

/** MIME types that may be served from the dossier table. Anything else is sent as a download. */
export const SERVABLE_ASSET_TYPES = new Set(SIGNATURES.map(signature => signature.mime));
