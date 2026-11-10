import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { Dossier } from 'src/dossier/entities/dossier.entity';
import { DossierService } from 'src/dossier/dossier.service';
import { SantaAudioService } from 'src/santa-audio/santa-audio.service';
import { AgencyFactsService } from 'src/dossier/agency-facts.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { UserService } from 'src/user/user.service';
import { DrawService } from './draw.service';
import { readBoolean, readOptionalId, readString } from './api/input';

const EDITABLE_FIELDS = ['name', 'email', 'familyId', 'lastYearGiftingToId', 'isAdmin', 'encryptionStrategy', 'interestingFacts'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];
type ParticipantInput = Partial<Record<EditableField, any>>;

const FIELD_LABELS: Record<EditableField, string> = {
    name: 'name',
    email: 'email',
    familyId: 'family',
    lastYearGiftingToId: 'last-year recipient',
    isAdmin: 'admin access',
    encryptionStrategy: 'strategy',
    interestingFacts: 'facts',
};

@Injectable()
export class ParticipantsService {
    constructor(
        @InjectModel(User)
        private readonly userRepository: typeof User,
        @InjectModel(Family)
        private readonly familyRepository: typeof Family,
        @InjectConnection()
        private readonly sequelize: Sequelize,
        private readonly userService: UserService,
        private readonly dossierService: DossierService,
        private readonly analyticsService: AnalyticsService,
        private readonly auditService: AuditService,
        private readonly encryptionService: EncryptionService,
        private readonly drawService: DrawService,
        private readonly santaAudioService: SantaAudioService,
        private readonly agencyFactsService: AgencyFactsService,
    ) { }

    public async list() {
        const [users, families, dossiers, activity, clipCounts] = await Promise.all([
            this.userRepository.findAll({ order: [['name', 'ASC']] }),
            this.familyRepository.findAll(),
            this.dossierService.getAllSummaries(),
            this.drawService.currentSeasonStart().then(since => this.analyticsService.participantActivity(since)),
            this.santaAudioService.nameClipCounts(),
        ]);
        const names = new Map(users.map(user => [user.id, user.name]));
        const familyNames = new Map(families.map(family => [family.id, family.name]));
        return users.map(user => {
            const dossier = dossiers.get(user.id);
            return {
                id: user.id,
                name: user.name,
                email: user.email,
                isAdmin: !!user.isAdmin,
                encryptionStrategy: user.encryptionStrategy,
                familyId: user.familyId ?? null,
                familyName: user.familyId ? familyNames.get(user.familyId) ?? null : null,
                lastYearGiftingToId: user.lastYearGiftingToId ?? null,
                lastYearGiftingToName: user.lastYearGiftingToId ? names.get(user.lastYearGiftingToId) ?? null : null,
                factsCount: countFacts(user.interestingFacts),
                hasAssignment: !!user.giftingTo,
                dossier: {
                    codename: dossier?.codename ?? '',
                    hasBrief: !!dossier?.missionBrief,
                    hasPhoto: !!dossier?.hasPhoto,
                    hasAudio: !!dossier?.hasAudio,
                },
                nameClips: clipCounts.get(user.id) ?? 0,
                activity: activity.get(user.id) ?? null,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            };
        });
    }

    public async detail(id: number) {
        const user = await this.require(id);
        const since = await this.drawService.currentSeasonStart();
        const [family, lastYear, dossier, activity, events, audit] = await Promise.all([
            user.familyId ? this.familyRepository.findByPk(user.familyId) : null,
            user.lastYearGiftingToId ? this.userRepository.findByPk(user.lastYearGiftingToId) : null,
            this.dossierService.getSummary(id),
            this.analyticsService.participantActivity(since),
            this.analyticsService.recentEvents({ limit: 25, offset: 0, userId: id }),
            this.auditService.list({ limit: 25, offset: 0, entityType: 'participant', entityId: id }),
        ]);
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            isAdmin: !!user.isAdmin,
            encryptionStrategy: user.encryptionStrategy,
            familyId: user.familyId ?? null,
            familyName: family?.name ?? null,
            lastYearGiftingToId: user.lastYearGiftingToId ?? null,
            lastYearGiftingToName: lastYear?.name ?? null,
            interestingFacts: user.interestingFacts ?? '',
            hasAssignment: !!user.giftingTo,
            hasLink: !!user.decryptionCode,
            dossier,
            nameClips: await this.santaAudioService.nameClipUrls(user),
            agencyFacts: await this.agencyFactsService.forRecipient(user.name),
            activity: activity.get(id) ?? null,
            events: events.items,
            audit: audit.items,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }

    public async create(actor: AuditActor, body: any) {
        const input = await this.parse(body, null);
        if (!input.name) {
            throw new BadRequestException('name is required');
        }
        const user = await this.userRepository.create({
            ...input,
            encryptionStrategy: input.encryptionStrategy ?? EncryptionStrategy.CODE,
            isAdmin: input.isAdmin ?? false,
        });
        await this.auditService.log(actor, {
            action: 'participant.create',
            entityType: 'participant',
            entityId: user.id,
            summary: `Added ${user.name}`,
        });
        const warnings = (await this.drawService.status()).state !== 'not_drawn'
            ? ['The draw has already been run. Run it again so this person is included.']
            : [];
        return { participant: await this.detail(user.id), warnings };
    }

    public async update(actor: AuditActor, id: number, body: any) {
        const user = await this.require(id);
        const input = await this.parse(body, user);
        if (input.isAdmin === false && user.id === actor.id) {
            throw new BadRequestException('You cannot remove your own admin access.');
        }
        const changes: Partial<Record<EditableField, { from: unknown; to: unknown }>> = {};
        for (const key of EDITABLE_FIELDS) {
            if (input[key] !== undefined && (input[key] ?? null) !== ((user as any)[key] ?? null)) {
                changes[key] = { from: (user as any)[key] ?? null, to: input[key] };
            }
        }
        if (Object.keys(changes).length === 0) {
            return { participant: await this.detail(id), warnings: [] };
        }
        const warnings: string[] = [];
        await this.sequelize.transaction(async transaction => {
            if (changes.name) {
                // Assignments store the recipient's name, so the Santa's assignment follows the rename.
                const santas = await this.userRepository.findAll({ transaction });
                for (const santa of santas) {
                    if (!santa.giftingTo || santa.encryptionStrategy !== EncryptionStrategy.CODE) continue;
                    let recipient: string | null = null;
                    try {
                        recipient = this.encryptionService.decryptGiftingTo(santa);
                    } catch { /* unreadable assignment, the draw check reports it */ }
                    if (recipient === user.name) {
                        const assignment = this.encryptionService.reencryptGiftingTo(santa, input.name!);
                        if (process.env.NODE_ENV === 'development') {
                            assignment.giftingToDebug = input.name!;
                        }
                        await this.userRepository.update(assignment, { where: { id: santa.id }, transaction });
                    }
                }
                if (((await this.santaAudioService.nameClipCounts()).get(user.id) ?? 0) > 0) {
                    warnings.push('Santa\'s name clips now say the old name. Regenerate them on the Santa audio page.');
                }
            }
            const values: Record<string, unknown> = {};
            for (const key of Object.keys(changes)) {
                values[key] = input[key as EditableField];
            }
            await this.userRepository.update(values, { where: { id }, transaction });
        });
        const changedLabels = Object.keys(changes).map(key => FIELD_LABELS[key as EditableField]);
        await this.auditService.log(actor, {
            action: 'participant.update',
            entityType: 'participant',
            entityId: id,
            summary: `Updated ${input.name ?? user.name}: ${changedLabels.join(', ')}`,
            details: { changes: redactFacts(changes) },
        });
        return { participant: await this.detail(id), warnings };
    }

    public async remove(actor: AuditActor, id: number) {
        const user = await this.require(id);
        if (user.id === actor.id) {
            throw new BadRequestException('You cannot delete yourself.');
        }
        const drawn = !!user.giftingTo;
        await this.sequelize.transaction(async transaction => {
            await this.userRepository.update({ lastYearGiftingToId: null }, { where: { lastYearGiftingToId: id }, transaction });
            await Dossier.destroy({ where: { userId: id }, transaction });
            await this.userRepository.destroy({ where: { id }, transaction });
        });
        await this.auditService.log(actor, {
            action: 'participant.delete',
            entityType: 'participant',
            entityId: id,
            summary: `Deleted ${user.name}`,
            details: { email: user.email },
        });
        return { warnings: drawn ? ['This person was part of the current draw. Run the draw again.'] : [] };
    }

    public async require(id: number): Promise<User> {
        const user = await this.userRepository.findByPk(id);
        if (!user) {
            throw new NotFoundException('Participant not found');
        }
        return user;
    }

    /** Validates a create/update body. Fields missing from the body stay undefined (unchanged). */
    private async parse(body: any, existing: User | null): Promise<ParticipantInput> {
        const input: ParticipantInput = {
            name: readString(body, 'name', { required: !existing, max: 100 }),
            email: readString(body, 'email', { max: 200 }),
            familyId: readOptionalId(body, 'familyId'),
            lastYearGiftingToId: readOptionalId(body, 'lastYearGiftingToId'),
            isAdmin: readBoolean(body, 'isAdmin'),
            encryptionStrategy: readString(body, 'encryptionStrategy'),
            interestingFacts: readString(body, 'interestingFacts', { max: 5000 }),
        };
        if (input.name !== undefined && !input.name) {
            throw new BadRequestException('name cannot be empty');
        }
        const others = (await this.userRepository.findAll()).filter(user => user.id !== existing?.id);
        if (input.name && others.some(user => user.name.toLowerCase() === input.name.toLowerCase())) {
            throw new BadRequestException(`There is already a participant called ${input.name}`);
        }
        if (input.email !== undefined) {
            input.email = input.email ? this.userService.cleanGmailAddress(input.email.toLowerCase()) : null;
            if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
                throw new BadRequestException('email does not look like an e-mail address');
            }
            if (input.email && others.some(user => user.email?.toLowerCase() === input.email)) {
                throw new BadRequestException(`${input.email} already belongs to another participant`);
            }
        }
        if (input.familyId && !(await this.familyRepository.findByPk(input.familyId))) {
            throw new BadRequestException('Family not found');
        }
        if (input.lastYearGiftingToId) {
            if (input.lastYearGiftingToId === existing?.id) {
                throw new BadRequestException('Last year\'s recipient cannot be the person themselves');
            }
            if (!others.some(user => user.id === input.lastYearGiftingToId)) {
                throw new BadRequestException('Last year\'s recipient not found');
            }
        }
        if (input.encryptionStrategy !== undefined && !Object.values(EncryptionStrategy).includes(input.encryptionStrategy)) {
            throw new BadRequestException('Unknown encryption strategy');
        }
        return input;
    }
}

function countFacts(facts: string | null | undefined): number {
    return (facts ?? '').split(/\r?\n/).filter(line => line.trim().length > 0).length;
}

function redactFacts(changes: Record<string, { from: unknown; to: unknown }>) {
    const copy = { ...changes };
    if (copy.interestingFacts) {
        copy.interestingFacts = { from: countFacts(copy.interestingFacts.from as string) + ' facts', to: countFacts(copy.interestingFacts.to as string) + ' facts' };
    }
    return copy;
}
