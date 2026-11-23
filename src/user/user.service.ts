import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, where } from 'sequelize';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

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

    public normalizeEmail(email: string) {
        return normalizeEmail(email);
    }

    public cleanGmailAddress(email: string) {
        return cleanGmailAddress(email);
    }
}
