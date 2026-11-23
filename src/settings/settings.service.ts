import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Group } from 'src/group/entities/group.entity';
import { httpsOrigin } from 'src/config/env';

export interface SiteSettings {
    /**
     * When false, the group is disabled: it is left out of the group selection (/grupp, the header switch) and
     * Google sign-in never lands in it. Personal links of its participants keep working.
     */
    groupEnabled: boolean;
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
    /** Show the recipient's "Teadaolevad faktid" (user.interestingFacts) in the dossier. Off for 2026. */
    showFacts: boolean;
}

const DEFAULTS: SiteSettings = {
    groupEnabled: true,
    revealOpen: true,
    revealClosedMessage: 'Loos ei ole veel avalikustatud. Proovi hiljem uuesti!',
    letterUrl: '',
    exchangeDate: '',
    giftBudget: '',
    adminNotes: '',
    agencyFactsPerDossier: 3,
    showFacts: false,
};

/** Keys of the per-group settings (also used to carry the old global settings into the first group). */
export const SETTING_KEYS = Object.keys(DEFAULTS) as (keyof SiteSettings)[];

const MAX_TEXT_LENGTH = 5000;

/**
 * Site settings, one set per group, stored in santa_group.settings. All groups' settings are cached, so reading
 * them is synchronous (the CSP header needs the letter origins without a database round trip).
 */
@Injectable()
export class SettingsService implements OnModuleInit {
    private cache = new Map<number, SiteSettings>();

    constructor(
        @InjectModel(Group)
        private readonly groupRepository: typeof Group,
    ) { }

    async onModuleInit() {
        await this.reload();
    }

    /** Re-reads every group's settings; call after creating or deleting a group. */
    public async reload() {
        const groups = await this.groupRepository.findAll({ attributes: ['id', 'settings'] });
        this.cache = new Map(groups.map(group => [group.id, pickSettings(group.settings)]));
    }

    public get(groupId: number): SiteSettings {
        return { ...(this.cache.get(groupId) ?? DEFAULTS) };
    }

    /** Whether participants can pick (or be signed in to) this group; see SiteSettings.groupEnabled. */
    public isGroupEnabled(groupId: number): boolean {
        return this.get(groupId).groupEnabled;
    }

    public letterUrl(groupId: number): string {
        return this.get(groupId).letterUrl || process.env.GOOGLE_DOC_LETTER_LINK || '';
    }

    /** Every https origin some group's letter lives on: the CSP frame-src allows exactly these. */
    public letterOrigins(): string[] {
        const urls = [...this.cache.values()].map(settings => settings.letterUrl);
        urls.push(process.env.GOOGLE_DOC_LETTER_LINK || '');
        return [...new Set(urls.map(httpsOrigin).filter((origin): origin is string => !!origin))];
    }

    /** Saves the given keys for one group; returns its full settings and which keys actually changed. */
    public async update(groupId: number, patch: Partial<SiteSettings>): Promise<{ settings: SiteSettings; changed: string[] }> {
        const group = await this.groupRepository.findByPk(groupId);
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        const current = pickSettings(group.settings);
        const next: Record<string, unknown> = { ...(group.settings ?? {}) };
        const changed: string[] = [];
        for (const [key, raw] of Object.entries(patch ?? {})) {
            if (!(key in DEFAULTS)) {
                throw new BadRequestException(`Unknown setting ${key}`);
            }
            const value = this.validate(key as keyof SiteSettings, raw);
            if (JSON.stringify(value) === JSON.stringify((current as any)[key])) {
                continue;
            }
            next[key] = value;
            changed.push(key);
        }
        if (changed.length) {
            await this.groupRepository.update({ settings: next }, { where: { id: groupId } });
        }
        await this.reload();
        return { settings: this.get(groupId), changed };
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
            // Embedded in an iframe on /kiri and allowed by the CSP frame-src: https only.
            if (key === 'letterUrl' && text && !isHttpsUrl(text)) {
                throw new BadRequestException('letterUrl must be an https:// address');
            }
            return text;
        }
        return value;
    }
}

/** Stored values over the defaults; unknown keys are ignored. */
function pickSettings(stored: Record<string, unknown> | null | undefined): SiteSettings {
    const settings: SiteSettings = { ...DEFAULTS };
    for (const key of SETTING_KEYS) {
        if (stored && key in stored && typeof stored[key] === typeof DEFAULTS[key]) {
            (settings as any)[key] = stored[key];
        }
    }
    return settings;
}

function isHttpsUrl(text: string): boolean {
    try {
        return new URL(text).protocol === 'https:';
    } catch {
        return false;
    }
}
