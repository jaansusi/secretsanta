#!/usr/bin/env node
/**
 * Pre-generates Santa's briefing clips with the ElevenLabs text-to-speech API.
 *
 * Clips are normally generated in the admin panel (/admin/audio), which keeps texts and audio in the database.
 * This script is the offline alternative: files it writes are imported into the database on the next app start
 * (slots with no clip or an older one). Edit texts in the admin panel; lines.json only seeds an empty database.
 *
 *   yarn santa-audio                      generate everything that is missing or whose text changed
 *   yarn santa-audio --dry-run            only print what would be sent (no API key needed)
 *   yarn santa-audio --only intros,outros skip the name lines
 *   yarn santa-audio --names "Mari,Jaan"  use these names instead of reading the user table
 *   yarn santa-audio --force              regenerate even if the clip already exists
 *
 * Reads lines.json next to this file. Participant names come from the `user` table (DB_* env vars)
 * unless --names is given. Clips land in public/audio/santa/ (commit them, the app serves them from there).
 * manifest.json next to this script records the text each clip was generated from, so unchanged lines are
 * skipped on the next run.
 *
 * Run through `node --env-file=.env` (see package.json) so the ELEVENLABS_* and DB_* variables load.
 */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// The app serves this folder statically; the manifest stays next to the script so it is not public.
const OUT_DIR = join(here, '..', '..', 'public', 'audio', 'santa');
const MANIFEST_PATH = join(here, 'manifest.json');
const API_BASE = 'https://api.elevenlabs.io/v1';
const LANGUAGE = 'et';

const args = parseArgs(process.argv.slice(2));

main().catch(error => {
    console.error(error.message);
    process.exit(1);
});

async function main() {
    const lines = JSON.parse(await readFile(join(here, 'lines.json'), 'utf8'));
    const only = args.only ? new Set(args.only.split(',').map(s => s.trim())) : null;
    const include = group => !only || only.has(group);

    const jobs = [];
    if (include('intros')) {
        lines.intros.forEach((text, i) => jobs.push({ file: `intro-${pad(i + 1)}.mp3`, text }));
    }
    if (include('outros')) {
        lines.outros.forEach((text, i) => jobs.push({ file: `outro-${pad(i + 1)}.mp3`, text }));
    }
    if (include('names')) {
        const names = args.names
            ? args.names.split(',').map(s => s.trim()).filter(Boolean)
            : await loadNamesFromDatabase();
        for (const name of names) {
            lines.nameLines.forEach((template, i) => jobs.push({
                file: `name-${slug(name)}-${i + 1}.mp3`,
                text: template.replaceAll('{name}', name),
                name,
            }));
        }
    }

    await mkdir(OUT_DIR, { recursive: true });
    const manifest = await readManifest();
    const pending = [];
    for (const job of jobs) {
        const unchanged = manifest[job.file]?.text === job.text && await exists(join(OUT_DIR, job.file));
        if (unchanged && !args.force) {
            continue;
        }
        pending.push(job);
    }

    const chars = pending.reduce((sum, job) => sum + job.text.length, 0);
    console.log(`${jobs.length} clips total, ${pending.length} to generate (${chars} characters).`);
    for (const job of pending) {
        console.log(`  ${job.file}  "${job.text}"`);
    }
    if (args['dry-run'] || pending.length === 0) {
        return;
    }

    const apiKey = requireEnv('ELEVENLABS_API_KEY');
    const voiceId = requireEnv('ELEVENLABS_VOICE_ID');
    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_v4';
    console.log(`\nVoice ${voiceId}, model ${modelId}, language ${LANGUAGE}\n`);

    let failures = 0;
    for (const job of pending) {
        process.stdout.write(`Generating ${job.file} ... `);
        try {
            const audio = await synthesize({ apiKey, voiceId, modelId, text: job.text });
            await writeFile(join(OUT_DIR, job.file), audio);
            manifest[job.file] = { text: job.text, name: job.name, modelId, voiceId, generatedAt: new Date().toISOString() };
            await writeManifest(manifest);
            console.log(`${(audio.length / 1024).toFixed(0)} kB`);
        } catch (error) {
            failures++;
            console.log(`FAILED\n    ${error.message}`);
        }
    }
    console.log(`\nDone: ${pending.length - failures} generated, ${failures} failed. Output in ${OUT_DIR}`);
    if (failures > 0) {
        process.exit(1);
    }
}

async function synthesize({ apiKey, voiceId, modelId, text }) {
    const url = `${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
    const voiceSettings = {
        stability: numberEnv('ELEVENLABS_STABILITY', 0.5),
        similarity_boost: numberEnv('ELEVENLABS_SIMILARITY', 0.75),
        speed: numberEnv('ELEVENLABS_SPEED', 0.95),
        use_speaker_boost: true,
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: modelId, language_code: LANGUAGE, voice_settings: voiceSettings }),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`ElevenLabs returned ${response.status}: ${body.slice(0, 400)}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

/** Participant names straight from the application database, so the list is never maintained twice. */
async function loadNamesFromDatabase() {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: requireEnv('DB_NAME'),
        user: requireEnv('DB_USER'),
        password: requireEnv('DB_PASSWORD'),
    });
    await client.connect();
    try {
        const result = await client.query('SELECT name FROM "user" WHERE name IS NOT NULL ORDER BY name');
        const names = result.rows.map(row => row.name.trim()).filter(Boolean);
        console.log(`Loaded ${names.length} names from the database.`);
        return names;
    } finally {
        await client.end();
    }
}

async function readManifest() {
    try {
        return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function writeManifest(manifest) {
    return writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

/** "Mari-Liis Õunapuu" -> "mari-liis-ounapuu" */
function slug(name) {
    return name
        .toLowerCase()
        .replace(/[õö]/g, 'o').replace(/ä/g, 'a').replace(/ü/g, 'u').replace(/š/g, 's').replace(/ž/g, 'z')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`${key} is not set. Add it to .env (the npm script loads .env automatically).`);
    }
    return value;
}

function numberEnv(key, fallback) {
    const value = parseFloat(process.env[key] ?? '');
    return Number.isFinite(value) ? value : fallback;
}

/** --flag value | --flag=value | --flag (boolean) */
function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) continue;
        const [key, inlineValue] = arg.slice(2).split('=', 2);
        if (inlineValue !== undefined) {
            result[key] = inlineValue;
        } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            result[key] = argv[++i];
        } else {
            result[key] = true;
        }
    }
    return result;
}
