/** ElevenLabs text-to-speech, configured with the ELEVENLABS_* environment variables. */
const API_BASE = 'https://api.elevenlabs.io/v1';
const LANGUAGE = 'et';

export interface ElevenLabsConfig {
    apiKey: string;
    voiceId: string;
    modelId: string;
}

export function elevenLabsConfig(): ElevenLabsConfig | null {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = process.env.ELEVENLABS_VOICE_ID;
    if (!apiKey || !voiceId) {
        return null;
    }
    // Estonian needs eleven_v3 or newer.
    return { apiKey, voiceId, modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_v4' };
}

export async function synthesize(config: ElevenLabsConfig, text: string): Promise<Buffer> {
    const url = `${API_BASE}/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
            text,
            model_id: config.modelId,
            language_code: LANGUAGE,
            voice_settings: {
                stability: numberEnv('ELEVENLABS_STABILITY', 0.5),
                similarity_boost: numberEnv('ELEVENLABS_SIMILARITY', 0.75),
                speed: numberEnv('ELEVENLABS_SPEED', 0.95),
                use_speaker_boost: true,
            },
        }),
        signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`ElevenLabs returned ${response.status}: ${body.slice(0, 300)}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

function numberEnv(key: string, fallback: number): number {
    const value = parseFloat(process.env[key] ?? '');
    return Number.isFinite(value) ? value : fallback;
}
