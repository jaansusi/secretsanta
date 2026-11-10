import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, where } from 'sequelize';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignUserDto } from './dto/assign-user.dto';

/** Decryption codes are 26+ random characters; anything shorter is never a valid code. */
const MIN_CODE_LENGTH = 16;
const MAX_CODE_LENGTH = 128;

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User)
        private userRepository: typeof User,
    ) { }

    // to-do: deprecate "find" functions that pass through options,
    // implement purpose-built functions for specific queries
    async findAll(options?: any) {
        return this.userRepository.findAll(options);
    }

    async findOne(options: any) {
        return this.userRepository.findOne(options);
    }

    /** Creates or updates a participant. Only the listed profile fields can ever be written. */
    async createUser(user: Partial<CreateUserDto>) {
        const userObject = {
            id: user.id ? user.id : undefined,
            name: user.name,
            email: user.email ? this.normalizeEmail(user.email) : null,
            encryptionStrategy: user.encryptionStrategy,
            isAdmin: user.isAdmin ?? false,
            familyId: user.familyId ?? null,
            lastYearGiftingToId: user.lastYearGiftingToId ?? null,
            interestingFacts: user.interestingFacts ?? null,
        };
        return this.userRepository.upsert(userObject);
    }

    async deleteUser(userId: number) {
        return this.userRepository.destroy({ where: { id: userId } });
    }

    async getById(id: number) {
        if (!Number.isSafeInteger(id) || id <= 0) {
            return null;
        }
        return this.userRepository.findByPk(id);
    }

    /** Case-insensitive, so rows saved before emails were normalized still match. */
    async getByEmail(email: string) {
        return this.userRepository.findOne({ where: where(fn('lower', col('email')), email.toLowerCase()) });
    }

    async getByName(name: string) {
        return this.userRepository.findOne({ where: { name } });
    }

    /**
     * Looks a user up by their decryption code. The input is untrusted (query string / JSON body),
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

    async setAdmin(id: number, isAdmin: boolean) {
        return this.userRepository.update({ isAdmin }, { where: { id } });
    }

    async assign(id: number, assignment: AssignUserDto) {
        return this.userRepository.update(
            {
                iv: assignment.iv,
                giftingTo: assignment.giftingTo,
                decryptionCode: assignment.decryptionCode,
                giftingToDebug: assignment.giftingToDebug ?? null,
            },
            { where: { id } },
        );
    }

    public async truncate() {
        return this.userRepository.truncate();
    }

    /** Lower-cases the address and folds Gmail aliases (dots, +tags) so logins match stored emails. */
    public normalizeEmail(email: string) {
        return this.cleanGmailAddress(email.trim().toLowerCase());
    }

    public cleanGmailAddress(email: string) {
        // Remove dots and spaces from email. Google sometimes leaves dots in, sometimes not.
        email = email.replace(/^([^@+]+)(\+[^@]*)?@(gmail|googlemail)\.com$/, (match, username) => {
            return username.replace(/\./g, '') + '@gmail.com';
        });
        return email;
    }

    /** Wipes every assignment and decryption code before a new draw. */
    public async cleanGiftingToForAll(): Promise<void> {
        await this.userRepository.update(
            { giftingTo: null, giftingToDebug: null, decryptionCode: null, iv: null },
            { where: {} },
        );
    }
}
