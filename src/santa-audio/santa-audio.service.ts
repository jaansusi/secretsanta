import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { SantaLine, SantaLineKind, SANTA_LINE_KINDS } from './entities/santa-line.entity';
import { SantaClip } from './entities/santa-clip.entity';
import { elevenLabsConfig, synthesize } from './eleven-labs';
import { createHmac, timingSafeEqual } from 'crypto';

export const SANTA_AUDIO_URL = '/santa-audio';
/** File name of a clip URL: `<id>.<generatedAtMs>.<signature>.mp3`. */
const CLIP_FILE = /^(\d{1,10})\.(\d{1,15})\.([A-Za-z0-9_-]{22})\.mp3$/;

/**
 * Key for clip URL signatures, derived from COOKIE_SECRET so no new secret has to be configured.
 * Name clips say a participant's name, so their URLs must not be guessable or enumerable.
 */
function clipUrlKey(): Buffer {
    return createHmac('sha256', process.env.COOKIE_SECRET ?? '').update('santa-audio-clip-url').digest();
}

/** 128-bit HMAC over the clip id and generation time, base64url (22 characters). */
function clipSignature(id: number, generatedAtMs: number): string {
    return createHmac('sha256', clipUrlKey()).update(`${id}.${generatedAtMs}`).digest().subarray(0, 16).toString('base64url');
}
const NAME_PLACEHOLDER = '{name}';
const MAX_LINE_LENGTH = 1000;
const MAX_REPORTED_ERRORS = 20;
/** Everything except the audio itself, for listings. */
const CLIP_META = { exclude: ['audio'] };

export type ClipStatus = 'ready' | 'stale' | 'missing';

/** What to generate: everything outdated, one line (for everyone), one participant, or one clip. */
export interface GenerationScope {
    scope: 'outdated' | 'line' | 'participant' | 'clip';
    lineId?: number;
    userId?: number;
    /** Also regenerate clips that are up to date. */
    force?: boolean;
}

interface GenerationItem {
    line: SantaLine;
    user: User | null;
    text: string;
    label: string;
}

export interface GenerationJob {
    running: boolean;
    cancelled: boolean;
    total: number;
    done: number;
    failed: number;
    characters: number;
    current: string | null;
    errors: string[];
    startedBy: string;
    startedAt: Date;
    finishedAt: Date | null;
}

@Injectable()
export class SantaAudioService {
    private job: GenerationJob | null = null;
    private cancelRequested = false;

    constructor(
        @InjectModel(SantaLine)
        private readonly lineRepository: typeof SantaLine,
        @InjectModel(SantaClip)
        private readonly clipRepository: typeof SantaClip,
        @InjectModel(User)
        private readonly userRepository: typeof User,
        private readonly auditService: AuditService,
        private readonly logger: Logger,
    ) { }

    // ---------- Lines ----------

    public async lines(): Promise<SantaLine[]> {
        return this.lineRepository.findAll({ order: [['kind', 'ASC'], ['position', 'ASC'], ['id', 'ASC']] });
    }

    public async createLine(actor: AuditActor, kind: unknown, text: unknown) {
        const lineKind = parseKind(kind);
        const lineText = validateText(lineKind, text);
        const last = await this.lineRepository.max<number, SantaLine>('position', { where: { kind: lineKind } });
        const line = await this.lineRepository.create({ kind: lineKind, text: lineText, position: (last ?? 0) + 1 });
        await this.auditService.log(actor, { action: 'audio.line_create', entityType: 'audio', entityId: line.id, summary: `Added a Santa ${lineKind} line` });
        return line;
    }

    public async updateLine(actor: AuditActor, id: number, text: unknown) {
        const line = await this.requireLine(id);
        const lineText = validateText(line.kind, text);
        if (lineText !== line.text) {
            await this.lineRepository.update({ text: lineText }, { where: { id } });
            await this.auditService.log(actor, { action: 'audio.line_update', entityType: 'audio', entityId: id, summary: `Edited a Santa ${line.kind} line` });
        }
    }

    public async deleteLine(actor: AuditActor, id: number) {
        const line = await this.requireLine(id);
        await this.clipRepository.destroy({ where: { lineId: id } });
        await this.lineRepository.destroy({ where: { id } });
        await this.auditService.log(actor, { action: 'audio.line_delete', entityType: 'audio', entityId: id, summary: `Deleted a Santa ${line.kind} line and its clips` });
    }

    public async moveLine(id: number, direction: unknown) {
        if (direction !== 'up' && direction !== 'down') {
            throw new BadRequestException('direction must be up or down');
        }
        const line = await this.requireLine(id);
        const siblings = (await this.lines()).filter(other => other.kind === line.kind);
        const index = siblings.findIndex(other => other.id === id);
        const swapWith = siblings[direction === 'up' ? index - 1 : index + 1];
        if (!swapWith) {
            return;
        }
        // Renumber so positions stay unique even if older rows shared one.
        siblings.splice(index, 1);
        siblings.splice(siblings.indexOf(swapWith) + (direction === 'up' ? 0 : 1), 0, line);
        await Promise.all(siblings.map((sibling, i) => this.lineRepository.update({ position: i + 1 }, { where: { id: sibling.id } })));
    }

    private async requireLine(id: number) {
        const line = await this.lineRepository.findByPk(id);
        if (!line) {
            throw new NotFoundException('Line not found');
        }
        return line;
    }

    // ---------- Clips ----------

    public expectedText(line: SantaLine, user: User | null): string {
        return line.kind === 'name' && user ? line.text.replaceAll(NAME_PLACEHOLDER, user.name) : line.text;
    }

    /**
     * Unguessable, signed URL of a clip. It changes when the clip is regenerated, so the audio can be
     * cached forever, and the old URL stops working.
     */
    public clipUrl(clip: SantaClip): string {
        const generatedAtMs = new Date(clip.generatedAt).getTime();
        return `${SANTA_AUDIO_URL}/${clip.id}.${generatedAtMs}.${clipSignature(clip.id, generatedAtMs)}.mp3`;
    }

    private async clipMetadata(): Promise<SantaClip[]> {
        return this.clipRepository.findAll({ attributes: CLIP_META });
    }

    private findClip(clips: SantaClip[], lineId: number, userId: number | null) {
        return clips.find(clip => clip.lineId === lineId && (clip.userId ?? null) === userId);
    }

    private status(clip: SantaClip | undefined, expected: string): ClipStatus {
        return !clip ? 'missing' : clip.text === expected ? 'ready' : 'stale';
    }

    /**
     * The clip behind a URL file name from clipUrl(), or null when the name is malformed, the signature
     * does not verify (guessed or enumerated ids) or the clip has since been regenerated or deleted.
     */
    public async getClipAudio(file: string): Promise<SantaClip | null> {
        const match = CLIP_FILE.exec(file);
        if (!match) {
            return null;
        }
        const id = Number(match[1]);
        const generatedAtMs = Number(match[2]);
        const expected = Buffer.from(clipSignature(id, generatedAtMs));
        const actual = Buffer.from(match[3]);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
            return null;
        }
        const clip = await this.clipRepository.findByPk(id);
        if (!clip || new Date(clip.generatedAt).getTime() !== generatedAtMs) {
            return null;
        }
        return clip;
    }

    public async deleteClip(actor: AuditActor, id: number) {
        const clip = await this.clipRepository.findByPk(id, { attributes: CLIP_META });
        if (!clip) {
            throw new NotFoundException('Clip not found');
        }
        await this.clipRepository.destroy({ where: { id } });
        await this.auditService.log(actor, { action: 'audio.clip_delete', entityType: 'audio', entityId: id, summary: `Deleted a Santa ${clip.kind} clip` });
    }

    /** Up-to-date intro and outro URLs for the reveal page, in line order. */
    public async playlist(): Promise<{ intros: string[]; outros: string[] }> {
        const [lines, clips] = await Promise.all([this.lines(), this.clipMetadata()]);
        const urls = (kind: SantaLineKind) => lines
            .filter(line => line.kind === kind)
            .map(line => this.findClip(clips, line.id, null))
            .filter((clip): clip is SantaClip => !!clip && clip.text === lines.find(l => l.id === clip.lineId)!.text)
            .map(clip => this.clipUrl(clip));
        return { intros: urls('intro'), outros: urls('outro') };
    }

    /** Up-to-date name clip URLs for one participant, in name line order. */
    public async nameClipUrls(user: User | null): Promise<string[]> {
        if (!user) {
            return [];
        }
        const [lines, clips] = await Promise.all([
            this.lineRepository.findAll({ where: { kind: 'name' }, order: [['position', 'ASC']] }),
            this.clipRepository.findAll({ where: { userId: user.id }, attributes: CLIP_META }),
        ]);
        return lines
            .map(line => ({ line, clip: this.findClip(clips, line.id, user.id) }))
            .filter(({ line, clip }) => clip && clip.text === this.expectedText(line, user))
            .map(({ clip }) => this.clipUrl(clip!));
    }

    /** How many up-to-date name clips each participant has. */
    public async nameClipCounts(): Promise<Map<number, number>> {
        const [lines, clips, users] = await Promise.all([
            this.lineRepository.findAll({ where: { kind: 'name' } }),
            this.clipRepository.findAll({ where: { kind: 'name' }, attributes: CLIP_META }),
            this.userRepository.findAll({ attributes: ['id', 'name'] }),
        ]);
        const counts = new Map<number, number>();
        for (const clip of clips) {
            const line = lines.find(l => l.id === clip.lineId);
            const user = users.find(u => u.id === clip.userId);
            if (line && user && clip.text === this.expectedText(line, user)) {
                counts.set(user.id, (counts.get(user.id) ?? 0) + 1);
            }
        }
        return counts;
    }

    /** Everything the admin audio page shows. */
    public async library() {
        const [lines, clips, users] = await Promise.all([
            this.lines(),
            this.clipMetadata(),
            this.userRepository.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] }),
        ]);
        const clipView = (clip: SantaClip | undefined) => clip ? {
            id: clip.id, url: this.clipUrl(clip), bytes: clip.bytes, text: clip.text,
            generatedAt: clip.generatedAt, modelId: clip.modelId, voiceId: clip.voiceId,
        } : null;
        let ready = 0, stale = 0, missing = 0, outdatedCharacters = 0;
        const count = (status: ClipStatus, expected: string) => {
            if (status === 'ready') ready++;
            else {
                if (status === 'stale') stale++; else missing++;
                outdatedCharacters += expected.length;
            }
        };
        const lineView = (line: SantaLine) => {
            const clip = this.findClip(clips, line.id, null);
            const status = this.status(clip, line.text);
            count(status, line.text);
            return { id: line.id, position: line.position, text: line.text, status, clip: clipView(clip) };
        };
        const nameLines = lines.filter(line => line.kind === 'name');
        const participants = users.map(user => ({
            id: user.id,
            name: user.name,
            clips: nameLines.map(line => {
                const expected = this.expectedText(line, user);
                const clip = this.findClip(clips, line.id, user.id);
                const status = this.status(clip, expected);
                count(status, expected);
                return { lineId: line.id, status, clip: clipView(clip) };
            }),
        }));
        const config = elevenLabsConfig();
        return {
            elevenLabs: { configured: !!config, voiceId: config?.voiceId ?? null, modelId: config?.modelId ?? null },
            intros: lines.filter(line => line.kind === 'intro').map(lineView),
            outros: lines.filter(line => line.kind === 'outro').map(lineView),
            nameLines: nameLines.map(line => ({ id: line.id, position: line.position, text: line.text })),
            participants,
            summary: { ready, stale, missing, outdatedCharacters },
            job: this.job,
        };
    }

    // ---------- Generation ----------

    /** The clips a scope would generate, without generating them. */
    public async plan(scope: GenerationScope): Promise<GenerationItem[]> {
        const [lines, clips, users] = await Promise.all([
            this.lines(),
            this.clipMetadata(),
            this.userRepository.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] }),
        ]);
        const candidates: GenerationItem[] = [];
        for (const line of lines) {
            if (scope.lineId && line.id !== scope.lineId) continue;
            if (line.kind === 'name') {
                for (const user of users) {
                    if (scope.userId && user.id !== scope.userId) continue;
                    candidates.push({ line, user, text: this.expectedText(line, user), label: `${user.name}, name line ${line.position}` });
                }
            } else if (!scope.userId) {
                candidates.push({ line, user: null, text: line.text, label: `${line.kind} ${line.position}` });
            }
        }
        if (scope.scope === 'participant' && !scope.userId) throw new BadRequestException('userId is required');
        if ((scope.scope === 'line' || scope.scope === 'clip') && !scope.lineId) throw new BadRequestException('lineId is required');
        return candidates.filter(item => scope.force || this.status(this.findClip(clips, item.line.id, item.user?.id ?? null), item.text) !== 'ready');
    }

    public async preview(scope: GenerationScope) {
        const items = await this.plan(scope);
        return { clips: items.length, characters: items.reduce((sum, item) => sum + item.text.length, 0) };
    }

    public jobState(): GenerationJob | null {
        return this.job;
    }

    public cancel() {
        if (this.job?.running) {
            this.cancelRequested = true;
        }
        return this.job;
    }

    /** Starts generating in the background; progress is read with jobState(). */
    public async start(actor: AuditActor, scope: GenerationScope): Promise<GenerationJob> {
        const config = elevenLabsConfig();
        if (!config) {
            throw new BadRequestException('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID on the server to generate audio.');
        }
        if (this.job?.running) {
            throw new BadRequestException('A generation is already running.');
        }
        const items = await this.plan(scope);
        if (items.length === 0) {
            throw new BadRequestException('Nothing to generate.');
        }
        this.cancelRequested = false;
        const job: GenerationJob = {
            running: true, cancelled: false, total: items.length, done: 0, failed: 0,
            characters: items.reduce((sum, item) => sum + item.text.length, 0),
            current: null, errors: [], startedBy: actor.name, startedAt: new Date(), finishedAt: null,
        };
        this.job = job;
        void this.run(job, items, actor, config);
        return job;
    }

    private async run(job: GenerationJob, items: GenerationItem[], actor: AuditActor, config: NonNullable<ReturnType<typeof elevenLabsConfig>>) {
        for (const item of items) {
            if (this.cancelRequested) {
                job.cancelled = true;
                break;
            }
            job.current = item.label;
            try {
                const audio = await synthesize(config, item.text);
                await this.saveClip(item, audio, config.modelId, config.voiceId);
                job.done++;
            } catch (err) {
                job.failed++;
                if (job.errors.length < MAX_REPORTED_ERRORS) {
                    job.errors.push(`${item.label}: ${err.message}`);
                }
                this.logger.warn(`Santa clip failed (${item.label}): ${err.message}`);
            }
        }
        job.running = false;
        job.current = null;
        job.finishedAt = new Date();
        await this.auditService.log(actor, {
            action: 'audio.generate',
            entityType: 'audio',
            summary: `Generated ${job.done} Santa clip${job.done === 1 ? '' : 's'}${job.failed ? `, ${job.failed} failed` : ''}${job.cancelled ? ' (cancelled)' : ''}`,
            details: { done: job.done, failed: job.failed, total: job.total, characters: job.characters },
        });
    }

    private async saveClip(item: GenerationItem, audio: Buffer, modelId: string, voiceId: string) {
        const values = {
            lineId: item.line.id, kind: item.line.kind, userId: item.user?.id ?? null, text: item.text,
            audio, mimeType: 'audio/mpeg', bytes: audio.length, modelId, voiceId, generatedAt: new Date(),
        };
        await this.upsertClip(values);
    }

    /** Replaces the clip for (line, participant), or creates it. */
    public async upsertClip(values: Omit<Partial<SantaClip>, 'userId'> & { lineId: number; userId: number | null }) {
        const existing = await this.clipRepository.findOne({
            where: { lineId: values.lineId, userId: values.userId },
            attributes: ['id'],
        });
        if (existing) {
            await this.clipRepository.update(values, { where: { id: existing.id } });
        } else {
            await this.clipRepository.create(values);
        }
    }
}

function parseKind(kind: unknown): SantaLineKind {
    if (!SANTA_LINE_KINDS.includes(kind as SantaLineKind)) {
        throw new BadRequestException('kind must be intro, name or outro');
    }
    return kind as SantaLineKind;
}

function validateText(kind: SantaLineKind, text: unknown): string {
    if (typeof text !== 'string' || !text.trim()) {
        throw new BadRequestException('text is required');
    }
    const trimmed = text.trim();
    if (trimmed.length > MAX_LINE_LENGTH) {
        throw new BadRequestException(`text must be at most ${MAX_LINE_LENGTH} characters`);
    }
    if (kind === 'name' && !trimmed.includes(NAME_PLACEHOLDER)) {
        throw new BadRequestException(`A name line must contain ${NAME_PLACEHOLDER}`);
    }
    if (kind !== 'name' && trimmed.includes(NAME_PLACEHOLDER)) {
        throw new BadRequestException(`Only name lines can contain ${NAME_PLACEHOLDER}`);
    }
    return trimmed;
}
