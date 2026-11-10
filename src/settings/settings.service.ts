import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Setting } from './entities/setting.entity';

export interface SiteSettings {
    /** When false, participants can open the site but not their mission. Admins can always open theirs. */
    revealOpen: boolean;
    /** Shown on the site instead of the mission while revealOpen is false. */
    revealClosedMessage: string;
    /** Google Doc behind /kiri. Falls back to GOOGLE_DOC_LETTER_LINK. */
    letterUrl: string;
    /** The day gifts are exchanged (YYYY-MM-DD), used for the countdown on the dashboard. */
    exchangeDate: string;
    /** Budget per gift, shown to admins as a reminder. Free text, e.g. "30 €". */
    giftBudget: string;
    /** Private notes for the organisers. */
    adminNotes: string;
    /** How many agency facts each dossier shows. */
    agencyFactsPerDossier: number;
}

const DEFAULTS: SiteSettings = {
    revealOpen: true,
    revealClosedMessage: 'Loos ei ole veel avalikustatud. Proovi hiljem uuesti!',
    letterUrl: '',
    exchangeDate: '',
    giftBudget: '',
    adminNotes: '',
    agencyFactsPerDossier: 3,
};

const MAX_TEXT_LENGTH = 5000;

@Injectable()
export class SettingsService implements OnModuleInit {
    private cache: SiteSettings = { ...DEFAULTS };

    constructor(
        @InjectModel(Setting)
        private readonly settingRepository: typeof Setting,
    ) { }

    async onModuleInit() {
        await this.reload();
    }

    private async reload() {
        const rows = await this.settingRepository.findAll();
        const loaded: Partial<SiteSettings> = {};
        for (const row of rows) {
            if (row.key in DEFAULTS) {
                (loaded as any)[row.key] = row.value;
            }
        }
        this.cache = { ...DEFAULTS, ...loaded };
    }

    public get(): SiteSettings {
        return { ...this.cache };
    }

    public letterUrl(): string {
        return this.cache.letterUrl || process.env.GOOGLE_DOC_LETTER_LINK || '';
    }

    /** Saves the given keys; returns the full settings and which keys actually changed. */
    public async update(patch: Partial<SiteSettings>): Promise<{ settings: SiteSettings; changed: string[] }> {
        const changed: string[] = [];
        for (const [key, raw] of Object.entries(patch ?? {})) {
            if (!(key in DEFAULTS)) {
                throw new BadRequestException(`Unknown setting ${key}`);
            }
            const value = this.validate(key as keyof SiteSettings, raw);
            if (JSON.stringify(value) === JSON.stringify((this.cache as any)[key])) {
                continue;
            }
            await this.settingRepository.upsert({ key, value });
            changed.push(key);
        }
        await this.reload();
        return { settings: this.get(), changed };
    }

    private validate(key: keyof SiteSettings, value: unknown): unknown {
        const expected = typeof DEFAULTS[key];
        if (typeof value !== expected) {
            throw new BadRequestException(`${key} must be a ${expected}`);
        }
        if (typeof value === 'number' && (!Number.isInteger(value) || value < 0 || value > 10)) {
            throw new BadRequestException(`${key} must be a whole number from 0 to 10`);
        }
        if (typeof value === 'string') {
            const text = value.trim();
            if (text.length > MAX_TEXT_LENGTH) {
                throw new BadRequestException(`${key} is too long`);
            }
            if (key === 'exchangeDate' && text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                throw new BadRequestException('exchangeDate must be YYYY-MM-DD');
            }
            if (key === 'letterUrl' && text && !/^https?:\/\//i.test(text)) {
                throw new BadRequestException('letterUrl must start with http:// or https://');
            }
            return text;
        }
        return value;
    }
}
