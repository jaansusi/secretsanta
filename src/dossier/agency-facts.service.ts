import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';
import { Setting } from 'src/settings/entities/setting.entity';
import { SettingsService } from 'src/settings/settings.service';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { AgencyFact } from './entities/agency-fact.entity';
import { DEFAULT_AGENCY_FACTS, assignAgencyFacts } from './agency-facts';

/** Marks the one-time seed, so deleting every fact does not bring the defaults back. */
const SEEDED_KEY = 'agencyFactsSeeded';
const MAX_LENGTH = 300;
const MAX_BULK = 500;

@Injectable()
export class AgencyFactsService implements OnApplicationBootstrap {
    private readonly logger = new Logger(AgencyFactsService.name);

    constructor(
        @InjectModel(AgencyFact)
        private readonly factRepository: typeof AgencyFact,
        @InjectModel(User)
        private readonly userRepository: typeof User,
        @InjectModel(Setting)
        private readonly settingRepository: typeof Setting,
        private readonly settingsService: SettingsService,
        private readonly auditService: AuditService,
    ) { }

    async onApplicationBootstrap() {
        if (await this.settingRepository.findByPk(SEEDED_KEY)) {
            return;
        }
        if (await this.factRepository.count() === 0) {
            // One by one, so ids follow the original order and everyone keeps the facts they had.
            for (const text of DEFAULT_AGENCY_FACTS) {
                await this.factRepository.create({ text, active: true });
            }
            this.logger.log(`Seeded ${DEFAULT_AGENCY_FACTS.length} agency facts`);
        }
        await this.settingRepository.upsert({ key: SEEDED_KEY, value: true });
    }

    private async activeTexts(): Promise<string[]> {
        const facts = await this.factRepository.findAll({ where: { active: true }, order: [['id', 'ASC']] });
        return facts.map(fact => fact.text);
    }

    /** Every participant's facts in one group (see assignAgencyFacts), by participant id. */
    private async assignments(groupId: number, active?: string[]): Promise<Map<number, string[]>> {
        const [texts, users] = await Promise.all([
            active ?? this.activeTexts(),
            this.userRepository.findAll({ where: { groupId }, attributes: ['id'] }),
        ]);
        return assignAgencyFacts(users.map(user => user.id), texts, this.settingsService.get(groupId).agencyFactsPerDossier);
    }

    /**
     * The facts a recipient's dossier shows. They are spread over the whole group (how many each is a setting of
     * the group), so every fact is used once before any is used twice.
     */
    public async forRecipient(recipient: Pick<User, 'id' | 'groupId'> | null | undefined): Promise<string[]> {
        if (!recipient?.id) {
            return [];
        }
        return (await this.assignments(recipient.groupId)).get(recipient.id) ?? [];
    }

    /**
     * All facts (shared by every group), each with the participants of the given group whose dossier currently
     * shows it.
     */
    public async list(groupId: number) {
        const [facts, users] = await Promise.all([
            this.factRepository.findAll({ order: [['id', 'ASC']] }),
            this.userRepository.findAll({ where: { groupId }, attributes: ['id', 'name'], order: [['name', 'ASC']] }),
        ]);
        const active = facts.filter(fact => fact.active).map(fact => fact.text);
        const count = this.settingsService.get(groupId).agencyFactsPerDossier;
        const assigned = await this.assignments(groupId, active);
        const shownTo = new Map<string, { id: number; name: string }[]>();
        for (const user of users) {
            for (const text of assigned.get(user.id) ?? []) {
                shownTo.set(text, [...(shownTo.get(text) ?? []), { id: user.id, name: user.name }]);
            }
        }
        return {
            perDossier: count,
            facts: facts.map(fact => ({
                id: fact.id,
                text: fact.text,
                active: fact.active,
                shownTo: fact.active ? shownTo.get(fact.text) ?? [] : [],
                updatedAt: fact.updatedAt,
            })),
        };
    }

    /** Adds one fact ({ text }) or many at once ({ texts }). */
    public async create(actor: AuditActor, body: any) {
        const raw: unknown[] = Array.isArray(body?.texts) ? body.texts : [body?.text];
        const texts = raw.map(text => (typeof text === 'string' ? text.trim() : '')).filter(Boolean);
        if (texts.length === 0) {
            throw new BadRequestException('text is required');
        }
        if (texts.length > MAX_BULK) {
            throw new BadRequestException(`At most ${MAX_BULK} facts at once`);
        }
        texts.forEach(validate);
        const created = await this.factRepository.bulkCreate(texts.map(text => ({ text, active: body?.active !== false })));
        await this.auditService.log(actor, {
            groupId: null, action: 'facts.create', entityType: 'facts',
            summary: texts.length === 1 ? `Added agency fact "${texts[0]}"` : `Added ${texts.length} agency facts`,
        });
        return created.map(fact => fact.id);
    }

    public async update(actor: AuditActor, id: number, body: any) {
        const fact = await this.require(id);
        const changes: Partial<AgencyFact> = {};
        if (body?.text !== undefined) {
            if (typeof body.text !== 'string') throw new BadRequestException('text must be text');
            changes.text = validate(body.text.trim());
        }
        if (body?.active !== undefined) {
            if (typeof body.active !== 'boolean') throw new BadRequestException('active must be true or false');
            changes.active = body.active;
        }
        const changed = (Object.keys(changes) as (keyof AgencyFact)[]).filter(key => changes[key] !== fact[key]);
        if (changed.length === 0) {
            return;
        }
        await this.factRepository.update(changes, { where: { id } });
        await this.auditService.log(actor, {
            groupId: null, action: 'facts.update', entityType: 'facts', entityId: id,
            summary: changed.includes('text')
                ? `Edited agency fact "${changes.text}"`
                : `${changes.active ? 'Enabled' : 'Disabled'} agency fact "${fact.text}"`,
            details: changed.includes('text') ? { from: fact.text } : undefined,
        });
    }

    public async remove(actor: AuditActor, id: number) {
        const fact = await this.require(id);
        await this.factRepository.destroy({ where: { id } });
        await this.auditService.log(actor, {
            groupId: null, action: 'facts.delete', entityType: 'facts', entityId: id,
            summary: `Deleted agency fact "${fact.text}"`,
        });
        return { text: fact.text, active: fact.active };
    }

    private async require(id: number) {
        const fact = await this.factRepository.findByPk(id);
        if (!fact) {
            throw new NotFoundException('Fact not found');
        }
        return fact;
    }
}

function validate(text: string): string {
    if (!text) {
        throw new BadRequestException('A fact cannot be empty');
    }
    if (text.length > MAX_LENGTH) {
        throw new BadRequestException(`A fact can be at most ${MAX_LENGTH} characters`);
    }
    return text;
}
