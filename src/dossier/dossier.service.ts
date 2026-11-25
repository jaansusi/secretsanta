import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { literal } from 'sequelize';
import { Dossier, DossierAssetKind } from './entities/dossier.entity';
import { DossierAsset, DossierSummaryDto, RevealDossierDto, SaveDossierDto } from './dto/dossier.dto';
import { User } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { SantaAudioService } from 'src/santa-audio/santa-audio.service';
import { AgencyFactsService } from './agency-facts.service';
import { SettingsService } from 'src/settings/settings.service';

@Injectable()
export class DossierService {
    // Binary columns are never selected for listings, only their presence.
    private static readonly SUMMARY_ATTRIBUTES: any[] = [
        'userId',
        'missionBrief',
        [literal('photo IS NOT NULL'), 'hasPhoto'],
        [literal('audio IS NOT NULL'), 'hasAudio'],
        [literal('octet_length(photo)'), 'photoBytes'],
        [literal('octet_length(audio)'), 'audioBytes'],
        'photoMimeType',
        'audioMimeType',
        'updatedAt',
    ];

    constructor(
        @InjectModel(Dossier)
        private readonly dossierRepository: typeof Dossier,
        private readonly userService: UserService,
        private readonly encryptionService: EncryptionService,
        private readonly santaAudioService: SantaAudioService,
        private readonly agencyFactsService: AgencyFactsService,
        private readonly settingsService: SettingsService,
        private readonly logger: Logger,
    ) { }

    public async getSummary(userId: number): Promise<DossierSummaryDto> {
        const [row, user] = await Promise.all([
            this.dossierRepository.findOne({ where: { userId }, attributes: DossierService.SUMMARY_ATTRIBUTES, raw: true }),
            this.userService.getById(userId),
        ]);
        return this.toSummary(userId, row, user ? await this.userService.agentName(user) : '');
    }

    /** The dossiers of the given participants (normally everyone in one group). */
    public async getSummaries(userIds: number[]): Promise<Map<number, DossierSummaryDto>> {
        if (!userIds.length) {
            return new Map();
        }
        const [rows, users] = await Promise.all([
            this.dossierRepository.findAll({ where: { userId: userIds }, attributes: DossierService.SUMMARY_ATTRIBUTES, raw: true }),
            this.userService.getByIds(userIds),
        ]);
        const codenames = new Map<number, string>();
        for (const groupId of new Set(users.map(user => user.groupId))) {
            for (const [userId, name] of await this.userService.agentNames(groupId)) codenames.set(userId, name);
        }
        const result = new Map<number, DossierSummaryDto>();
        for (const row of rows) {
            result.set(row.userId, this.toSummary(row.userId, row, codenames.get(row.userId) ?? ''));
        }
        return result;
    }

    public async saveText(userId: number, dto: SaveDossierDto): Promise<DossierSummaryDto> {
        const [dossier] = await this.dossierRepository.findOrCreate({
            where: { userId },
            defaults: { userId },
            attributes: ['id', 'userId'],
        });
        dossier.missionBrief = (dto.missionBrief ?? '').trim();
        await dossier.save();
        return this.getSummary(userId);
    }

    public async saveAsset(userId: number, kind: DossierAssetKind, data: Buffer, mimeType: string): Promise<DossierSummaryDto> {
        const [dossier] = await this.dossierRepository.findOrCreate({
            where: { userId },
            defaults: { userId },
            attributes: ['id', 'userId'],
        });
        dossier.set(kind, data);
        dossier.set(`${kind}MimeType`, mimeType);
        await dossier.save();
        this.logger.log(`Dossier ${kind} saved for user ${userId} (${data.length} bytes, ${mimeType})`);
        return this.getSummary(userId);
    }

    public async deleteAsset(userId: number, kind: DossierAssetKind): Promise<DossierSummaryDto> {
        await this.dossierRepository.update(
            { [kind]: null, [`${kind}MimeType`]: null },
            { where: { userId } },
        );
        return this.getSummary(userId);
    }

    public async getAsset(userId: number, kind: DossierAssetKind): Promise<DossierAsset | null> {
        const row = await this.dossierRepository.findOne({
            where: { userId },
            attributes: [kind, `${kind}MimeType`],
        });
        const data: Buffer | null = row ? row.get(kind) : null;
        if (!row || !data || data.length === 0) {
            return null;
        }
        return { data, mimeType: row.get(`${kind}MimeType`) || 'application/octet-stream' };
    }

    /**
     * Resolves the user that the given Santa is gifting to.
     * Only possible for the code strategy, which is decrypted server-side.
     */
    public async getRecipientForSanta(santa: User): Promise<User | null> {
        if (santa.encryptionStrategy !== EncryptionStrategy.CODE || !santa.giftingTo) {
            return null;
        }
        try {
            const recipientName = this.encryptionService.decryptGiftingTo(santa);
            return this.userService.getByName(santa.groupId, recipientName);
        } catch (err) {
            this.logger.warn(`Could not resolve recipient for user ${santa.id}: ${err.message}`);
            return null;
        }
    }

    /** Builds the dossier shown to the Santa on the reveal page. */
    public async getRevealDossier(recipient: User | null): Promise<RevealDossierDto> {
        const summary = recipient ? await this.getSummary(recipient.id) : null;
        // "Teadaolevad faktid" are only sent when the showFacts setting is on (off for 2026).
        const facts = !recipient || !this.settingsService.get(recipient.groupId).showFacts ? [] : (recipient.interestingFacts ?? '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);
        return {
            // The target's one codename, the same name their Santa sees on the maze scoreboard.
            codename: summary?.codename ?? '',
            missionBrief: summary?.missionBrief ?? '',
            facts,
            hasPhoto: summary?.hasPhoto ?? false,
            hasAudio: summary?.hasAudio ?? false,
            clips: { names: await this.santaAudioService.nameClipUrls(recipient) },
            agencyFacts: await this.agencyFactsService.forRecipient(recipient),
        };
    }

    /** Santa's intro and outro clips; the page needs them before the recipient is known. */
    public async getClipPlaylist(): Promise<{ intros: string[]; outros: string[] }> {
        return this.santaAudioService.playlist();
    }

    private toSummary(userId: number, row: any, codename: string): DossierSummaryDto {
        return {
            userId,
            codename,
            missionBrief: row?.missionBrief ?? '',
            hasPhoto: !!row?.hasPhoto,
            hasAudio: !!row?.hasAudio,
            photoBytes: row?.photoBytes ? Number(row.photoBytes) : 0,
            audioBytes: row?.audioBytes ? Number(row.audioBytes) : 0,
            photoMimeType: row?.photoMimeType ?? null,
            audioMimeType: row?.audioMimeType ?? null,
            updatedAt: row?.updatedAt ?? null,
        };
    }
}
