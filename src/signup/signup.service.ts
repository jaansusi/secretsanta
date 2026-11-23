import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { randomBytes } from 'crypto';
import { Group } from 'src/group/entities/group.entity';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { SettingsService } from 'src/settings/settings.service';
import { EncryptionStrategy } from 'src/encryption/encryption.service';
import { readBoolean } from 'src/admin/api/input';
import { UserService } from 'src/user/user.service';
import { parseSignup, SignupFormValues } from './signup-input';

/** Path of the sign-up page; the code follows it. */
export const SIGNUP_PATH = '/liitu';
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Why a sign-up link does not take sign-ups right now:
 * - closed: an admin turned sign-up off;
 * - drawn: the draw has been run, so someone joining now would be left out of it.
 */
export type SignupState = 'open' | 'closed' | 'drawn';

export type SignupOutcome =
    | { ok: true; user: User; familyName: string | null; newFamily: boolean }
    | { ok: false; error: string; values: SignupFormValues };

/**
 * Self-service sign-up: an admin shares a group's secret link, and people with it add themselves to that group,
 * optionally joining an existing family or creating one. Nobody gets admin access or a personal link this way;
 * personal links come from the draw, as for everyone else.
 */
@Injectable()
export class SignupService {
    constructor(
        @InjectModel(Group) private readonly groupRepository: typeof Group,
        @InjectModel(User) private readonly userRepository: typeof User,
        @InjectModel(Family) private readonly familyRepository: typeof Family,
        @InjectConnection() private readonly sequelize: Sequelize,
        private readonly settingsService: SettingsService,
        private readonly auditService: AuditService,
        private readonly userService: UserService,
    ) { }

    /** The group a sign-up code belongs to and whether it takes sign-ups, or null for an unknown code. */
    public async findByCode(code: unknown): Promise<{ group: Group; state: SignupState } | null> {
        if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
            return null;
        }
        const group = await this.groupRepository.findOne({ where: { signupCode: code } });
        if (!group) {
            return null;
        }
        return { group, state: await this.state(group.id) };
    }

    /** What the sign-up form offers: the group's families and whether a new one may be created. */
    public async formOptions(groupId: number) {
        const families = await this.familyRepository.findAll({ where: { groupId }, attributes: ['id', 'name'], order: [['name', 'ASC']] });
        return {
            families: families.map(family => ({ id: family.id, name: family.name })),
            allowNewFamilies: this.settingsService.get(groupId).signupNewFamilies,
        };
    }

    /** Adds the person to the group. The caller has checked that the group's sign-up is open. */
    public async register(groupId: number, body: unknown): Promise<SignupOutcome> {
        const [families, participants] = await Promise.all([
            this.familyRepository.findAll({ where: { groupId }, attributes: ['id', 'name'] }),
            this.userRepository.findAll({ where: { groupId }, attributes: ['name', 'email'] }),
        ]);
        const parsed = parseSignup(body, {
            families: families.map(family => ({ id: family.id, name: family.name })),
            participants: participants.map(person => ({ name: person.name, email: person.email })),
            allowNewFamilies: this.settingsService.get(groupId).signupNewFamilies,
        });
        if (!parsed.ok) {
            return parsed;
        }
        const { input } = parsed;
        const familyId = input.family.kind === 'existing' ? input.family.familyId : null;
        let created: { user: User; family: Family | null };
        try {
            created = await this.sequelize.transaction(async transaction => {
                const family = input.family.kind === 'new'
                    ? await this.familyRepository.create({ groupId, name: input.family.name }, { transaction })
                    : input.family.kind === 'existing' ? families.find(candidate => candidate.id === familyId) ?? null : null;
                const user = await this.userRepository.create({
                    groupId,
                    name: input.name,
                    email: input.email,
                    familyId: family?.id ?? null,
                    encryptionStrategy: EncryptionStrategy.CODE,
                    isAdmin: false,
                }, { transaction });
                return { user, family };
            });
        } catch (error) {
            // Someone else signed up with the same name, e-mail or new family a moment earlier.
            if (error instanceof UniqueConstraintError) {
                return { ok: false, error: 'Keegi lisas end just samade andmetega. Proovi uuesti.', values: valuesOf(body) };
            }
            throw error;
        }

        const { user, family } = created;
        // The person is the actor of their own sign-up, so the activity log shows who added themselves.
        const actor: AuditActor = { id: user.id, name: user.name };
        if (input.family.kind === 'new' && family) {
            await this.auditService.log(actor, {
                groupId, action: 'family.create', entityType: 'family', entityId: family.id,
                summary: `Created family ${family.name} when signing up`,
            });
        }
        await this.auditService.log(actor, {
            groupId, action: 'participant.signup', entityType: 'participant', entityId: user.id,
            summary: `${user.name} signed up with the sign-up link` + (family ? ` (family ${family.name})` : ''),
            details: { email: user.email, familyId: family?.id ?? null, newFamily: input.family.kind === 'new' },
        });
        return { ok: true, user, familyName: family?.name ?? null, newFamily: input.family.kind === 'new' };
    }

    /** The sign-up link as the admin panel shows it. */
    public async adminStatus(groupId: number) {
        const group = await this.groupRepository.findByPk(groupId, { attributes: ['id', 'signupCode'] });
        const settings = this.settingsService.get(groupId);
        const [state, signups] = await Promise.all([
            this.state(groupId),
            this.auditService.list({ groupId, limit: 1, offset: 0, action: 'participant.signup' }).then(page => page.total),
        ]);
        return {
            open: settings.signupOpen,
            state,
            allowNewFamilies: settings.signupNewFamilies,
            url: group?.signupCode ? signupUrl(group.signupCode) : null,
            signups,
        };
    }

    /** Opens or closes sign-up and sets whether new families may be created. Opening for the first time makes the link. */
    public async adminUpdate(actor: AuditActor, groupId: number, body: unknown) {
        const open = readBoolean(body, 'open');
        const allowNewFamilies = readBoolean(body, 'allowNewFamilies');
        if (open === undefined && allowNewFamilies === undefined) {
            throw new BadRequestException('Nothing to change');
        }
        if (open) {
            await this.ensureCode(groupId);
        }
        const { settings, changed } = await this.settingsService.update(groupId, {
            ...(open !== undefined ? { signupOpen: open } : {}),
            ...(allowNewFamilies !== undefined ? { signupNewFamilies: allowNewFamilies } : {}),
        });
        if (changed.length) {
            const parts: string[] = [];
            if (changed.includes('signupOpen')) parts.push(settings.signupOpen ? 'Opened sign-up' : 'Closed sign-up');
            if (changed.includes('signupNewFamilies')) parts.push(settings.signupNewFamilies ? 'allowed new families at sign-up' : 'stopped new families at sign-up');
            const summary = parts.join(' and ');
            await this.auditService.log(actor, {
                groupId, action: 'signup.update', entityType: 'settings',
                summary: summary.charAt(0).toUpperCase() + summary.slice(1),
                details: { changed },
            });
        }
        return this.adminStatus(groupId);
    }

    /** Replaces the link: the old one stops working at once, e.g. after it was shared too widely. */
    public async regenerate(actor: AuditActor, groupId: number) {
        await this.groupRepository.update({ signupCode: newCode() }, { where: { id: groupId } });
        await this.auditService.log(actor, {
            groupId, action: 'signup.new_link', entityType: 'settings',
            summary: 'Replaced the sign-up link (the old one no longer works)',
        });
        return this.adminStatus(groupId);
    }

    private async ensureCode(groupId: number) {
        await this.groupRepository.update({ signupCode: newCode() }, { where: { id: groupId, signupCode: null } });
    }

    private async state(groupId: number): Promise<SignupState> {
        if (!this.settingsService.get(groupId).signupOpen) {
            return 'closed';
        }
        return (await this.userService.isGroupDrawn(groupId)) ? 'drawn' : 'open';
    }
}

/** 144 random bits, URL-safe. */
function newCode(): string {
    return randomBytes(18).toString('base64url');
}

export function signupUrl(code: string): string {
    const host = (process.env.HOST || '').replace(/\/+$/, '');
    return `${host}${SIGNUP_PATH}/${code}`;
}

function valuesOf(body: unknown): SignupFormValues {
    const get = (key: string) => {
        const value = (body as Record<string, unknown> | null | undefined)?.[key];
        return typeof value === 'string' ? value.trim() : '';
    };
    return { name: get('name'), email: get('email'), family: get('family'), newFamily: get('newFamily') };
}
