import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { User } from 'src/user/entities/user.entity';
import { CLIPS_DIR, santaSlug } from 'src/dossier/santa-clips';
import { SantaLine, SantaLineKind } from './entities/santa-line.entity';
import { SantaClip } from './entities/santa-clip.entity';
import { SantaAudioService } from './santa-audio.service';
import { Setting } from 'src/settings/entities/setting.entity';

/** Marks the one-time seed, so deleting every line does not bring lines.json back. */
const SEEDED_KEY = 'santaLinesSeeded';

/** scripts/santa-audio holds the original texts (lines.json) and what each file was generated from (manifest.json). */
const SCRIPT_DIR = join(__dirname, '..', '..', 'scripts', 'santa-audio');

interface ManifestEntry {
    text?: string;
    modelId?: string;
    voiceId?: string;
    generatedAt?: string;
}

/**
 * Brings script-era content into the database on startup:
 * - the texts from lines.json, when no lines exist yet;
 * - mp3s in scripts/santa-audio/clips made with `yarn santa-audio`, when the database has no clip for that slot
 *   or an older one. Files are matched by name: intro-NN, outro-NN, name-<slug>-N (N = name line number).
 */
@Injectable()
export class SantaAudioImport implements OnApplicationBootstrap {
    private readonly logger = new Logger(SantaAudioImport.name);

    constructor(
        @InjectModel(SantaLine)
        private readonly lineRepository: typeof SantaLine,
        @InjectModel(SantaClip)
        private readonly clipRepository: typeof SantaClip,
        @InjectModel(User)
        private readonly userRepository: typeof User,
        @InjectModel(Setting)
        private readonly settingRepository: typeof Setting,
        private readonly santaAudioService: SantaAudioService,
    ) { }

    async onApplicationBootstrap() {
        try {
            await this.importLines();
            await this.importClips();
        } catch (err) {
            this.logger.error(`Santa audio import failed: ${err.message}`);
        }
    }

    private async importLines() {
        if (await this.settingRepository.findByPk(SEEDED_KEY)) {
            return;
        }
        if (await this.lineRepository.count() > 0) {
            await this.settingRepository.upsert({ key: SEEDED_KEY, value: true });
            return;
        }
        const lines = readJson<{ intros?: string[]; nameLines?: string[]; outros?: string[] }>(join(SCRIPT_DIR, 'lines.json'));
        if (!lines) {
            return;
        }
        const rows = [
            ...(lines.intros ?? []).map((text, i) => ({ kind: 'intro', position: i + 1, text })),
            ...(lines.nameLines ?? []).map((text, i) => ({ kind: 'name', position: i + 1, text })),
            ...(lines.outros ?? []).map((text, i) => ({ kind: 'outro', position: i + 1, text })),
        ];
        await this.lineRepository.bulkCreate(rows);
        await this.settingRepository.upsert({ key: SEEDED_KEY, value: true });
        this.logger.log(`Imported ${rows.length} Santa lines from lines.json`);
    }

    private async importClips() {
        let files: string[];
        try {
            files = readdirSync(CLIPS_DIR).filter(file => file.endsWith('.mp3'));
        } catch {
            return;
        }
        if (files.length === 0) {
            return;
        }
        const manifest = readJson<Record<string, ManifestEntry>>(join(SCRIPT_DIR, 'manifest.json')) ?? {};
        const lines = await this.lineRepository.findAll();
        const users = await this.userRepository.findAll({ attributes: ['id', 'name'] });
        const existing = await this.clipRepository.findAll({ attributes: ['id', 'lineId', 'userId', 'generatedAt'] });
        const lineAt = (kind: SantaLineKind, position: number) => lines.find(line => line.kind === kind && line.position === position);
        let imported = 0;

        for (const file of files) {
            let line: SantaLine | undefined;
            let user: User | undefined;
            const plain = /^(intro|outro)-(\d+)\.mp3$/.exec(file);
            const named = /^name-(.+)-(\d+)\.mp3$/.exec(file);
            if (plain) {
                line = lineAt(plain[1] as SantaLineKind, parseInt(plain[2], 10));
            } else if (named) {
                line = lineAt('name', parseInt(named[2], 10));
                user = users.find(candidate => santaSlug(candidate.name) === named[1]);
                if (!user) continue;
            }
            if (!line) continue;

            const path = join(CLIPS_DIR, file);
            const entry = manifest[file];
            const generatedAt = entry?.generatedAt ? new Date(entry.generatedAt) : statSync(path).mtime;
            const current = existing.find(clip => clip.lineId === line!.id && (clip.userId ?? null) === (user?.id ?? null));
            if (current && new Date(current.generatedAt) >= generatedAt) {
                continue;
            }
            const audio = readFileSync(path);
            await this.santaAudioService.upsertClip({
                lineId: line.id,
                kind: line.kind,
                userId: user?.id ?? null,
                text: entry?.text ?? this.santaAudioService.expectedText(line, user ?? null),
                audio,
                mimeType: 'audio/mpeg',
                bytes: audio.length,
                modelId: entry?.modelId ?? null,
                voiceId: entry?.voiceId ?? null,
                generatedAt,
            } as any);
            imported++;
        }
        if (imported) {
            this.logger.log(`Imported ${imported} Santa clips from ${CLIPS_DIR}`);
        }
    }
}

function readJson<T>(path: string): T | null {
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch {
        return null;
    }
}
