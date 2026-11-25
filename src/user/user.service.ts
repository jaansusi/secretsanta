import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, Op, where } from 'sequelize';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { newAgentNames } from './agent-names';

/** Decryption codes are 26+ random characters; anything shorter is never a valid code. */
const MIN_CODE_LENGTH = 16;
const MAX_CODE_LENGTH = 128;

/** Lower-cases the address and folds Gmail aliases (dots, +tags) so logins match stored emails. */
export function normalizeEmail(email: string): string {
    return cleanGmailAddress(email.trim().toLowerCase());
}

export function cleanGmailAddress(email: string): string {
    // Remove dots and spaces from email. Google sometimes leaves dots in, sometimes not.
    return email.replace(/^([^@+]+)(\+[^@]*)?@(gmail|googlemail)\.com$/, (_match, username) => {
        return username.replace(/\./g, '') + '@gmail.com';
    });
}

/** ADMIN_EMAIL, normalized: the super admin, who manages every group. Null when not configured. */
export function superAdminEmail(): string | null {
    const configured = process.env.ADMIN_EMAIL || '';
    return configured ? normalizeEmail(configured) : null;
}

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User)
        private userRepository: typeof User,
    ) { }

    /** Creates a participant in a group. Only the listed profile fields can ever be written. */
    async createUser(groupId: number, user: Partial<CreateUserDto>) {
        return this.userRepository.create({
            groupId,
            name: user.name,
            email: user.email ? this.normalizeEmail(user.email) : null,
            encryptionStrategy: user.encryptionStrategy,
            isAdmin: user.isAdmin ?? false,
            familyId: user.familyId ?? null,
            lastYearGiftingToId: user.lastYearGiftingToId ?? null,
            interestingFacts: user.interestingFacts ?? null,
        });
    }

    async getById(id: number) {
        if (!Number.isSafeInteger(id) || id <= 0) {
            return null;
        }
        return this.userRepository.findByPk(id);
    }

    /**
     * Every participant row with this e-mail, one per group the person takes part in, oldest group first.
     * Case-insensitive, so rows saved before emails were normalized still match.
     */
    async getAllByEmail(email: string) {
        return this.userRepository.findAll({
            where: where(fn('lower', col('email')), normalizeEmail(email)),
            order: [['groupId', 'ASC'], ['id', 'ASC']],
        });
    }

    /** Names are unique within a group only, so a name lookup always needs the group. */
    async getByName(groupId: number, name: string) {
        return this.userRepository.findOne({ where: { groupId, name } });
    }

    /**
     * Looks a user up by their decryption code. Codes are random, so they identify one participant in one group.
     * The input is untrusted (query string / JSON body),
     * so anything that is not a plausible code string is rejected before it reaches the query:
     * arrays or objects would otherwise turn into IN (...) / operator clauses.
     */
    async getByDecryptionCode(code: unknown) {
        if (typeof code !== 'string') {
            return null;
        }
        const trimmed = code.trim();
        if (trimmed.length < MIN_CODE_LENGTH || trimmed.length > MAX_CODE_LENGTH) {
            return null;
        }
        return this.userRepository.findOne({ where: { decryptionCode: trimmed } });
    }

    /** Whether the group's draw has been run, i.e. someone in it has a recipient. */
    async isGroupDrawn(groupId: number): Promise<boolean> {
        const assigned = await this.userRepository.count({
            where: { groupId, giftingTo: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
        });
        return assigned > 0;
    }

    public normalizeEmail(email: string) {
        return normalizeEmail(email);
    }

    public cleanGmailAddress(email: string) {
        return cleanGmailAddress(email);
    }

    async getByIds(ids: number[]) {
        return ids.length ? this.userRepository.findAll({ where: { id: ids } }) : [];
    }

    /**
     * Every participant's agent name in one group (see agent-names.ts), by user id. Participants without
     * one get a new, unique one here, so a name exists from the first time anyone needs it.
     */
    async agentNames(groupId: number): Promise<Map<number, string>> {
        const read = (rows: User[]) => new Map(rows.map(row => [row.id, row.agentName ?? '']));
        const users = await this.userRepository.findAll({ where: { groupId }, attributes: ['id', 'agentName'] });
        if (users.every(user => user.agentName)) {
            return read(users);
        }
        // Rows locked, so two requests at once cannot hand out the same name.
        return this.userRepository.sequelize!.transaction(async transaction => {
            const locked = await this.userRepository.findAll({
                where: { groupId }, attributes: ['id', 'agentName'], order: [['id', 'ASC']], lock: transaction.LOCK.UPDATE, transaction,
            });
            const missing = locked.filter(user => !user.agentName);
            const names = newAgentNames(locked.flatMap(user => user.agentName ? [user.agentName] : []), missing.length);
            for (const [i, user] of missing.entries()) {
                await this.userRepository.update({ agentName: names[i] }, { where: { id: user.id }, transaction });
                user.agentName = names[i];
            }
            return read(locked);
        });
    }

    /** One participant's agent name, giving one out if they have none yet. */
    async agentName(user: Pick<User, 'id' | 'groupId' | 'agentName'>): Promise<string> {
        return user.agentName || (await this.agentNames(user.groupId)).get(user.id) || '';
    }
}
