import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as crypto from 'crypto';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { AuditActor, AuditService } from 'src/audit/audit.service';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'na';

export interface DrawCheck {
    key: string;
    label: string;
    status: CheckStatus;
    detail?: string;
}

interface Node {
    id: number;
    name: string;
    familyId: number | null;
    lastYearGiftingToId: number | null;
}

/** Search budget per attempt, so an impossible constraint set fails fast instead of hanging. */
const MAX_STEPS_PER_ATTEMPT = 200_000;
const MAX_ATTEMPTS = 20;

const ASSIGNMENT_CLEARED = { giftingTo: '', giftingToDebug: '', decryptionCode: '', iv: '' };

/**
 * Secret Santa draw: everyone is put on one closed chain (A gives to B, B to C, ... back to A),
 * never giving to themselves, their own family, or last year's recipient.
 * Admins never see who gives to whom; only the checks below.
 */
@Injectable()
export class DrawService {
    constructor(
        @InjectModel(User)
        private readonly userRepository: typeof User,
        @InjectModel(Family)
        private readonly familyRepository: typeof Family,
        @InjectConnection()
        private readonly sequelize: Sequelize,
        private readonly encryptionService: EncryptionService,
        private readonly auditService: AuditService,
        private readonly logger: Logger,
    ) { }

    private async loadUsers(): Promise<User[]> {
        return this.userRepository.findAll({ order: [['id', 'ASC']] });
    }

    private forbiddenMap(nodes: Node[]): Map<number, Set<number>> {
        const map = new Map<number, Set<number>>();
        for (const node of nodes) {
            const forbidden = new Set<number>([node.id]);
            if (node.familyId) {
                nodes.filter(other => other.familyId === node.familyId).forEach(other => forbidden.add(other.id));
            }
            if (node.lastYearGiftingToId) {
                forbidden.add(node.lastYearGiftingToId);
            }
            map.set(node.id, forbidden);
        }
        return map;
    }

    /** Randomised backtracking search for one cycle through everyone. Null when none was found. */
    private findCycle(nodes: Node[]): Node[] | null {
        if (nodes.length < 2) {
            return null;
        }
        const forbidden = this.forbiddenMap(nodes);
        const allowed = (from: Node, to: Node) => !forbidden.get(from.id)!.has(to.id);

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            const order = shuffle(nodes.slice());
            const start = order[0];
            const path: Node[] = [start];
            const used = new Set<number>([start.id]);
            let steps = 0;

            const extend = (): boolean => {
                if (++steps > MAX_STEPS_PER_ATTEMPT) {
                    return false;
                }
                const current = path[path.length - 1];
                if (path.length === nodes.length) {
                    return allowed(current, start);
                }
                for (const next of shuffle(order.filter(node => !used.has(node.id) && allowed(current, node)))) {
                    path.push(next);
                    used.add(next.id);
                    if (extend()) {
                        return true;
                    }
                    path.pop();
                    used.delete(next.id);
                }
                return false;
            };
            if (extend()) {
                return path;
            }
        }
        return null;
    }

    /** What the constraints look like before drawing, and whether a valid draw exists. */
    public async constraints() {
        const users = await this.loadUsers();
        const families = await this.familyRepository.findAll();
        const nodes = users.map(toNode);
        const forbidden = this.forbiddenMap(nodes);
        const byId = new Map(users.map(user => [user.id, user]));
        const warnings: string[] = [];

        const perParticipant = users.map(user => {
            const allowed = users.length - forbidden.get(user.id)!.size;
            return {
                id: user.id,
                name: user.name,
                familyName: families.find(family => family.id === user.familyId)?.name ?? null,
                lastYearName: user.lastYearGiftingToId ? byId.get(user.lastYearGiftingToId)?.name ?? null : null,
                allowed,
            };
        });

        if (users.length < 3) {
            warnings.push('At least 3 participants are needed for a draw.');
        }
        perParticipant.filter(p => p.allowed === 0).forEach(p => warnings.push(`${p.name} has nobody they are allowed to give to.`));
        for (const family of families) {
            const size = users.filter(user => user.familyId === family.id).length;
            if (size > users.length - size) {
                warnings.push(`Family "${family.name}" has ${size} of ${users.length} participants. A family can be at most half of the group.`);
            }
        }
        users.filter(user => user.lastYearGiftingToId && !byId.has(user.lastYearGiftingToId))
            .forEach(user => warnings.push(`${user.name}'s last-year recipient no longer exists.`));
        users.filter(user => user.encryptionStrategy !== EncryptionStrategy.CODE)
            .forEach(user => warnings.push(`${user.name} uses the "${user.encryptionStrategy}" strategy, which cannot be drawn.`));

        const feasible = users.length >= 3 && this.findCycle(nodes) !== null;
        return { feasible, warnings, perParticipant };
    }

    public async run(actor: AuditActor) {
        const users = await this.loadUsers();
        const unsupported = users.filter(user => user.encryptionStrategy !== EncryptionStrategy.CODE);
        if (unsupported.length) {
            throw new BadRequestException(`Cannot draw: ${unsupported.map(u => u.name).join(', ')} use an unsupported encryption strategy.`);
        }
        if (users.length < 3) {
            throw new BadRequestException('At least 3 participants are needed for a draw.');
        }
        const cycle = this.findCycle(users.map(toNode));
        if (!cycle) {
            throw new BadRequestException('No valid draw exists with the current families and last-year rules.');
        }
        const byId = new Map(users.map(user => [user.id, user]));
        await this.sequelize.transaction(async transaction => {
            for (let i = 0; i < cycle.length; i++) {
                const santa = byId.get(cycle[i].id)!;
                const recipient = cycle[(i + 1) % cycle.length];
                const assignment = await this.encryptionService.encryptGiftingTo(santa, recipient.name);
                // Plaintext copy for local debugging only; needs an explicit opt-in (see .env.template).
                if (process.env.NODE_ENV === 'development' && process.env.STORE_DEBUG_ASSIGNMENTS === 'true') {
                    assignment.giftingToDebug = recipient.name;
                }
                await this.userRepository.update(assignment, { where: { id: santa.id }, transaction });
            }
        });
        this.logger.log(`Draw completed for ${cycle.length} participants by ${actor.name}`);
        await this.auditService.log(actor, {
            action: 'draw.run',
            summary: `Ran the draw for ${cycle.length} participants`,
            details: { participants: cycle.length },
        });
        return this.status();
    }

    public async clear(actor: AuditActor) {
        await this.userRepository.update(ASSIGNMENT_CLEARED, { where: {} });
        await this.auditService.log(actor, { action: 'draw.clear', summary: 'Cleared all assignments' });
        return this.status();
    }

    /**
     * Ends the season: each participant's current recipient becomes their "last year" recipient,
     * so next year's draw avoids repeats, and the current assignments are cleared.
     */
    public async rollover(actor: AuditActor) {
        const users = await this.loadUsers();
        const byName = new Map(users.map(user => [user.name, user]));
        let recorded = 0;
        const skipped: string[] = [];
        await this.sequelize.transaction(async transaction => {
            for (const user of users) {
                const recipient = this.tryDecrypt(user);
                const recipientUser = recipient ? byName.get(recipient) : undefined;
                if (recipientUser) {
                    await this.userRepository.update({ lastYearGiftingToId: recipientUser.id }, { where: { id: user.id }, transaction });
                    recorded++;
                } else {
                    skipped.push(user.name);
                }
            }
            await this.userRepository.update(ASSIGNMENT_CLEARED, { where: {}, transaction });
        });
        await this.auditService.log(actor, {
            action: 'draw.rollover',
            summary: `Started a new season: saved ${recorded} last-year recipients and cleared the draw`,
            details: { recorded, skipped },
        });
        return { recorded, skipped, status: await this.status() };
    }

    private tryDecrypt(user: User): string | null {
        if (!user.giftingTo || user.encryptionStrategy !== EncryptionStrategy.CODE) {
            return null;
        }
        try {
            return this.encryptionService.decryptGiftingTo(user);
        } catch {
            return null;
        }
    }

    /** Validates the stored draw without revealing any pairs. */
    public async status() {
        const users = await this.loadUsers();
        const byName = new Map(users.map(user => [user.name, user]));
        const assigned = users.filter(user => !!user.giftingTo);
        const lastRun = await this.auditService.lastOccurrence('draw.run');
        const checks: DrawCheck[] = [];
        const drawn = assigned.length > 0;

        const add = (key: string, label: string, failures: number, detail: (n: number) => string, warnOnly = false) => {
            checks.push({
                key, label,
                status: !drawn ? 'na' : failures === 0 ? 'pass' : warnOnly ? 'warn' : 'fail',
                detail: drawn && failures > 0 ? detail(failures) : undefined,
            });
        };

        const missing = users.length - assigned.length;
        add('assigned', 'Everyone has someone to give to', missing, n => `${n} without a recipient`);

        const recipients = new Map<number, User>();
        let unreadable = 0;
        let unknownRecipient = 0;
        for (const user of assigned) {
            const name = this.tryDecrypt(user);
            if (name === null) {
                unreadable++;
                continue;
            }
            const recipient = byName.get(name);
            if (!recipient) {
                unknownRecipient++;
                continue;
            }
            recipients.set(user.id, recipient);
        }
        add('readable', 'Every assignment can be opened', unreadable, n => `${n} cannot be decrypted`);
        add('recipients_exist', 'Every recipient is a current participant', unknownRecipient, n => `${n} point to a renamed or deleted participant`);

        const counts = new Map<number, number>();
        recipients.forEach(recipient => counts.set(recipient.id, (counts.get(recipient.id) ?? 0) + 1));
        const duplicates = [...counts.values()].filter(count => count > 1).length;
        const nobodyGivesTo = users.filter(user => !counts.has(user.id)).length;
        add('unique', 'Everyone receives exactly one gift', duplicates + (missing === 0 ? nobodyGivesTo : 0),
            () => `${nobodyGivesTo} would get nothing, ${duplicates} would get more than one`);

        let self = 0, family = 0, repeat = 0;
        recipients.forEach((recipient, santaId) => {
            const santa = users.find(user => user.id === santaId)!;
            if (recipient.id === santa.id) self++;
            if (santa.familyId && recipient.familyId === santa.familyId && recipient.id !== santa.id) family++;
            if (santa.lastYearGiftingToId && santa.lastYearGiftingToId === recipient.id) repeat++;
        });
        add('no_self', 'Nobody gives to themselves', self, n => `${n} would give to themselves`);
        add('no_family', 'Nobody gives to their own family', family, n => `${n} would give within their family`);
        add('no_repeat', "Nobody gets last year's recipient again", repeat, n => `${n} would repeat last year`);

        // Follow the chain from one person: a proper draw visits everybody before returning.
        let chainLength = 0;
        if (recipients.size === users.length && users.length > 0) {
            const seen = new Set<number>();
            let current: number | undefined = users[0].id;
            while (current !== undefined && !seen.has(current)) {
                seen.add(current);
                current = recipients.get(current)?.id;
            }
            chainLength = seen.size;
        }
        add('single_chain', 'Gifts form one chain through everyone', chainLength === users.length ? 0 : 1,
            () => 'The draw splits into separate groups', true);

        const hashData = users.map(x => x.id + x.name + x.giftingTo + x.encryptionStrategy + x.email + x.familyId).join();
        const dbHash = crypto.createHash('shake256', { outputLength: 4 }).update(hashData).digest('hex');

        const failing = checks.filter(check => check.status === 'fail').length;
        return {
            participants: users.length,
            assigned: assigned.length,
            state: !drawn ? 'not_drawn' : failing > 0 ? 'invalid' : 'valid',
            lastRun: lastRun ? { at: lastRun.createdAt, by: lastRun.actorName } : null,
            dbHash,
            checks,
        };
    }

    /** Time of the latest draw: activity before it belongs to a previous season. */
    public async currentSeasonStart(): Promise<Date | null> {
        return (await this.auditService.lastOccurrence('draw.run'))?.createdAt ?? null;
    }

    /** Personal links participants open to see their mission. They change with every draw. */
    public async links() {
        const host = (process.env.HOST ?? '').replace(/\/+$/, '');
        const users = await this.userRepository.findAll({ order: [['name', 'ASC']] });
        return users.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            url: user.decryptionCode ? `${host}/?code=${encodeURIComponent(user.decryptionCode)}` : null,
        }));
    }
}

function toNode(user: User): Node {
    return {
        id: user.id,
        name: user.name,
        familyId: user.familyId ?? null,
        lastYearGiftingToId: user.lastYearGiftingToId ?? null,
    };
}

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
