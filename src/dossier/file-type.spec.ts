import { detectAssetType } from './file-type';

describe('detectAssetType', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(16)]);
    const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(16)]);

    it('recognises allowed images and audio by content', () => {
        expect(detectAssetType(png, 'photo')).toBe('image/png');
        expect(detectAssetType(jpeg, 'photo')).toBe('image/jpeg');
        expect(detectAssetType(mp3, 'audio')).toBe('audio/mpeg');
        expect(detectAssetType(ogg, 'audio')).toBe('audio/ogg');
    });

    it('rejects scriptable formats regardless of the claimed type', () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        const html = Buffer.from('<!doctype html><script>alert(1)</script>');
        expect(detectAssetType(svg, 'photo')).toBeNull();
        expect(detectAssetType(html, 'photo')).toBeNull();
        expect(detectAssetType(html, 'audio')).toBeNull();
    });

    it('does not accept audio as a photo or vice versa', () => {
        expect(detectAssetType(mp3, 'photo')).toBeNull();
        expect(detectAssetType(png, 'audio')).toBeNull();
    });

    it('rejects empty and truncated input', () => {
        expect(detectAssetType(Buffer.alloc(0), 'photo')).toBeNull();
        expect(detectAssetType(Buffer.from([0xff, 0xd8]), 'photo')).toBeNull();
    });
});
