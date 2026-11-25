import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as crypto from 'crypto';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { AuditActor, AuditService, secret } from 'src/audit/audit.service';

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
 * Secret Santa draw, one group at a time: everyone in the group is put on one closed chain (A gives to B,
 * B to C, ... back to A), never giving to themselves, their own family, or last year's recipient.
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

    private async loadUsers(groupId: number): Promise<User[]> {
        return this.userRepository.findAll({ where: { groupId }, order: [['id', 'ASC']] });
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
    public async constraints(groupId: number) {
        const users = await this.loadUsers(groupId);
        const families = await this.familyRepository.findAll({ where: { groupId } });
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

    public async run(actor: AuditActor, groupId: number) {
        const users = await this.loadUsers(groupId);
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
            groupId,
            action: 'draw.run',
            summary: `Ran the draw for ${cycle.length} participants`,
            details: { participants: cycle.length },
        });
        return this.status(groupId);
    }

    public async clear(actor: AuditActor, groupId: number) {
        await this.userRepository.update(ASSIGNMENT_CLEARED, { where: { groupId } });
        await this.auditService.log(actor, { groupId, action: 'draw.clear', summary: 'Cleared all assignments' });
        return this.status(groupId);
    }

    /**
     * Ends the season: each participant's current recipient becomes their "last year" recipient,
     * so next year's draw avoids repeats, and the current assignments are cleared.
     */
    public async rollover(actor: AuditActor, groupId: number) {
        const users = await this.loadUsers(groupId);
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
            await this.userRepository.update(ASSIGNMENT_CLEARED, { where: { groupId }, transaction });
        });
        await this.auditService.log(actor, {
            groupId,
            action: 'draw.rollover',
            summary: `Started a new season: saved ${recorded} last-year recipients and cleared the draw`,
            details: { recorded, skipped },
        });
        return { recorded, skipped, status: await this.status(groupId) };
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
    public async status(groupId: number) {
        const users = await this.loadUsers(groupId);
        const byName = new Map(users.map(user => [user.name, user]));
        const assigned = users.filter(user => !!user.giftingTo);
        const lastRun = await this.auditService.lastOccurrence(groupId, 'draw.run');
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

    /**
     * Who a latecomer (someone without a recipient after the draw) can be added after. Adding them after Santa X
     * splits one link of the chain: X gives to the latecomer, and the latecomer takes over X's old recipient Y.
     * X qualifies when both new links follow the rules (family, last year). Y is never returned.
     */
    public async insertionCandidates(groupId: number, latecomerId: number): Promise<User[]> {
        const users = await this.loadUsers(groupId);
        return this.insertionPoints(users, this.requireLatecomer(users, latecomerId)).map(point => point.santa);
    }

    /**
     * Adds a latecomer to the existing draw after the given Santa (see insertionCandidates), without touching
     * anyone else. The Santa keeps their code and link, only their recipient changes; the latecomer gets a new
     * code. The audit entry names the Santa only when the admin chose them (`revealSanta`).
     */
    public async insert(actor: AuditActor, groupId: number, latecomerId: number, santaId: number, revealSanta: boolean) {
        const { latecomer, santa } = await this.sequelize.transaction(async transaction => {
            const users = await this.userRepository.findAll({ where: { groupId }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
            const latecomer = this.requireLatecomer(users, latecomerId);
            const point = this.insertionPoints(users, latecomer).find(candidate => candidate.santa.id === santaId);
            if (!point) {
                throw new BadRequestException('That person cannot give to them: check families, last year\'s recipients and the draw.');
            }
            const debug = process.env.NODE_ENV === 'development' && process.env.STORE_DEBUG_ASSIGNMENTS === 'true';
            const own = await this.encryptionService.encryptGiftingTo(latecomer, point.recipient.name);
            const santaAssignment = this.encryptionService.reencryptGiftingTo(point.santa, latecomer.name);
            if (debug) {
                own.giftingToDebug = point.recipient.name;
                santaAssignment.giftingToDebug = latecomer.name;
            }
            await this.userRepository.update(own, { where: { id: latecomer.id }, transaction });
            await this.userRepository.update(santaAssignment, { where: { id: point.santa.id }, transaction });
            return { latecomer, santa: point.santa };
        });
        await this.auditService.log(actor, {
            groupId,
            action: 'draw.insert',
            entityType: 'participant',
            entityId: latecomer.id,
            summary: revealSanta
                ? `Added ${latecomer.name} to the draw: ${secret(santa.name)} now gives to them`
                : `Added ${latecomer.name} to the draw`,
            details: revealSanta ? { santaId: santa.id } : undefined,
        });
        return santa;
    }

    private requireLatecomer(users: User[], latecomerId: number): User {
        const latecomer = users.find(user => user.id === latecomerId);
        if (!latecomer) {
            throw new NotFoundException('Participant not found');
        }
        if (latecomer.giftingTo) {
            throw new BadRequestException(`${latecomer.name} is already in the draw`);
        }
        if (latecomer.encryptionStrategy !== EncryptionStrategy.CODE) {
            throw new BadRequestException(`${latecomer.name} uses an encryption strategy that cannot be drawn`);
        }
        if (!users.some(user => user.giftingTo)) {
            throw new BadRequestException('The draw has not been run yet: run it to include everyone.');
        }
        return latecomer;
    }

    /** Every link Santa -> recipient the latecomer can be put into, following the draw's rules both ways. */
    private insertionPoints(users: User[], latecomer: User): { santa: User; recipient: User }[] {
        const byName = new Map(users.map(user => [user.name, user]));
        const forbidden = this.forbiddenMap(users.map(toNode));
        const points: { santa: User; recipient: User }[] = [];
        for (const santa of users) {
            if (santa.id === latecomer.id) continue;
            const name = this.tryDecrypt(santa);
            const recipient = name !== null ? byName.get(name) : undefined;
            if (!recipient || recipient.id === latecomer.id) continue;
            if (forbidden.get(santa.id)!.has(latecomer.id) || forbidden.get(latecomer.id)!.has(recipient.id)) continue;
            points.push({ santa, recipient });
        }
        return points;
    }

    /**
     * Everyone `santaId` could be set to give to (see reassign). `blocked` says why a person cannot be chosen;
     * their current recipient is listed like anyone else so the list does not give it away.
     */
    public async reassignOptions(groupId: number, santaId: number) {
        const users = await this.loadUsers(groupId);
        const santa = this.requireInDraw(users, santaId);
        const links = this.currentLinks(users);
        const forbidden = this.forbiddenMap(users.map(toNode)).get(santa.id)!;
        return users.filter(user => user.id !== santa.id).map(user => {
            let blocked: string | null = null;
            if (!links.has(user.id)) blocked = 'not in the draw';
            else if (santa.familyId && user.familyId === santa.familyId) blocked = 'same family';
            else if (forbidden.has(user.id)) blocked = "last year's recipient";
            else if (links.get(santa.id)!.id !== user.id && !this.reassignPlans(users, links, santa, user).length) {
                blocked = 'does not fit without breaking the rules for others';
            }
            return { id: user.id, name: user.name, blocked };
        }).sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || a.name.localeCompare(b.name));
    }

    /**
     * Makes `santaId` give to `recipientId` in the existing draw, changing as few others as possible. Whoever
     * gave to the new recipient needs someone else, so one of two re-wirings is used (X = santa, Y = new
     * recipient, A = X's old recipient, S = Y's old Santa, B = Y's old recipient):
     * - move Y next to X: X -> Y -> A, and S -> B. Keeps one chain; S and Y get new recipients.
     * - swap: X -> Y, and S -> A. Only S gets a new recipient, but the chain splits in two.
     * Every new link must follow the family and last-year rules. The re-wiring that changes the fewest people in
     * `opened` (who already saw their mission) wins, preferring the one that keeps the chain. Personal links stay.
     */
    public async reassign(actor: AuditActor, groupId: number, santaId: number, recipientId: number, opened: Set<number>) {
        const { santa, recipient, changed, kind } = await this.sequelize.transaction(async transaction => {
            const users = await this.userRepository.findAll({ where: { groupId }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
            const santa = this.requireInDraw(users, santaId);
            const recipient = users.find(user => user.id === recipientId);
            if (!recipient || recipient.id === santa.id) {
                throw new BadRequestException('Choose someone else in the group');
            }
            const links = this.currentLinks(users);
            if (!links.has(recipient.id)) {
                throw new BadRequestException(`${recipient.name} is not in the draw yet: add them to it first`);
            }
            if (links.get(santa.id)!.id === recipient.id) {
                throw new BadRequestException(`${santa.name} already gives to ${recipient.name}`);
            }
            const forbidden = this.forbiddenMap(users.map(toNode)).get(santa.id)!;
            if (forbidden.has(recipient.id)) {
                throw new BadRequestException(`${santa.name} cannot give to ${recipient.name}: same family or last year's recipient`);
            }
            const plans = this.reassignPlans(users, links, santa, recipient);
            if (!plans.length) {
                throw new BadRequestException(`${recipient.name} does not fit without breaking the family or last-year rules for someone else. Run the draw again instead.`);
            }
            const cost = (plan: Map<User, User>) => [...plan.keys()].filter(user => user.id !== santa.id && opened.has(user.id)).length;
            const plan = plans.reduce((best, next) => (cost(next) < cost(best) ? next : best));

            const debug = process.env.NODE_ENV === 'development' && process.env.STORE_DEBUG_ASSIGNMENTS === 'true';
            for (const [giver, newRecipient] of plan) {
                const assignment = this.encryptionService.reencryptGiftingTo(giver, newRecipient.name);
                if (debug) {
                    assignment.giftingToDebug = newRecipient.name;
                }
                await this.userRepository.update(assignment, { where: { id: giver.id }, transaction });
            }
            const kind: 'move' | 'swap' = plan.size === 3 ? 'move' : 'swap';
            return { santa, recipient, kind, changed: [...plan.keys()].filter(user => user.id !== santa.id) };
        });
        await this.auditService.log(actor, {
            groupId,
            action: 'draw.reassign',
            entityType: 'participant',
            entityId: santa.id,
            summary: `Set ${santa.name} to give to ${secret(recipient.name)} (${changed.length} other${changed.length === 1 ? '' : 's'} got a new recipient)`,
            details: { recipientId: recipient.id, kind, changedIds: changed.map(user => user.id) },
        });
        return { santa, recipient, changed, kind };
    }

    /** Valid re-wirings for reassign, best first, as giver -> new recipient. Empty when none follows the rules. */
    private reassignPlans(users: User[], links: Map<number, User>, santa: User, recipient: User): Map<User, User>[] {
        const forbidden = this.forbiddenMap(users.map(toNode));
        const allowed = (plan: Map<User, User>) => [...plan].every(([giver, to]) => !forbidden.get(giver.id)!.has(to.id));
        const oldRecipient = links.get(santa.id)!;
        const recipientsSanta = users.find(user => links.get(user.id)?.id === recipient.id)!;
        const recipientsRecipient = links.get(recipient.id)!;

        const move = new Map<User, User>([[santa, recipient], [recipient, oldRecipient], [recipientsSanta, recipientsRecipient]]);
        const swap = new Map<User, User>([[santa, recipient], [recipientsSanta, oldRecipient]]);
        return [move, swap].filter(allowed);
    }

    /** Who gives to whom right now. Throws unless the draw is a clean one-to-one assignment (latecomers aside). */
    private currentLinks(users: User[]): Map<number, User> {
        const byName = new Map(users.map(user => [user.name, user]));
        const links = new Map<number, User>();
        for (const user of users.filter(u => u.giftingTo)) {
            const name = this.tryDecrypt(user);
            const recipient = name !== null ? byName.get(name) : undefined;
            if (!recipient || !recipient.giftingTo) {
                throw new BadRequestException('The current draw has problems (see the Draw page). Run it again first.');
            }
            links.set(user.id, recipient);
        }
        if (new Set([...links.values()].map(user => user.id)).size !== links.size) {
            throw new BadRequestException('The current draw has problems (see the Draw page). Run it again first.');
        }
        return links;
    }

    private requireInDraw(users: User[], santaId: number): User {
        const santa = users.find(user => user.id === santaId);
        if (!santa) {
            throw new NotFoundException('Participant not found');
        }
        if (!santa.giftingTo) {
            throw new BadRequestException(`${santa.name} is not in the draw: run the draw or add them to it first`);
        }
        if (santa.encryptionStrategy !== EncryptionStrategy.CODE) {
            throw new BadRequestException(`${santa.name} uses an encryption strategy that cannot be changed on the server`);
        }
        return santa;
    }

    /** Time of the group's latest draw: activity before it belongs to a previous season. */
    public async currentSeasonStart(groupId: number): Promise<Date | null> {
        return (await this.auditService.lastOccurrence(groupId, 'draw.run'))?.createdAt ?? null;
    }

    /** Personal links participants open to see their mission. They change with every draw. */
    public async links(groupId: number) {
        const host = (process.env.HOST ?? '').replace(/\/+$/, '');
        const users = await this.userRepository.findAll({ where: { groupId }, order: [['name', 'ASC']] });
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
