import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import * as fs from 'fs';
import * as path from 'path';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
    constructor(
        @InjectModel(User)
        private userRepository: typeof User,
        private encryptionService: EncryptionService,
        private configService: ConfigService,
    ) { }

    // to-do: deprecate "find" functions that pass through options, 
    // implement purpose-built functions for specific queries 
    async findAll(options?: any) {
        return this.userRepository.findAll(options);
    }

    async findOne(options: any) {
        return this.userRepository.findOne(options);
    }

    async createUser(user: CreateUserDto) {
        const userObject = {
            id: user.id ? user.id : undefined,
            name: user.name,
            email: user.email,
            idCode: user.idCode,
            encryptionStrategy: user.encryptionStrategy,
            isAdmin: user.isAdmin,
            familyId: user.familyId,
            lastYearGiftingToId: user.lastYearGiftingToId,
            interestingFacts: user.interestingFacts,
        };
        return this.userRepository.upsert(userObject);
    }

    async deleteUser(userId: number) {
        return this.userRepository.destroy({ where: { id: userId } });
    }

    async getById(id: number) {
        return this.userRepository.findByPk(id);
    }

    async getByEmail(email: string) {
        return this.userRepository.findOne({ where: { email } });
    }

    async getByName(name: string) {
        return this.userRepository.findOne({ where: { name } });
    }

    async getByDecryptionCode(decryptionCode: string) {
        return this.userRepository.findOne({ where: { decryptionCode } });
    }

    async updateUser(id: number, user: CreateUserDto|AssignUserDto) {
        return this.userRepository.update(user, { where: { id } });
    }

    public async truncate() {
        return this.userRepository.truncate();
    }

    public cleanGmailAddress(email: string) {
        // Remove dots and spaces from email. Google sometimes leaves dots in, sometimes not.
        email = email.replace(/^([^@+]+)(\+[^@]*)?@gmail\.com$/, (match, username) => {
            return username.replace(/\./g, '') + '@gmail.com';
        });
        return email;
    }

    public async getUserCdoc(idCode: string): Promise<string> {
        try {
            const file = fs.readFileSync(path.join(this.configService.get('CDOC_PATH') || '', idCode + '.cdoc'), 'utf8');
            return file;
        } catch (err) {
            console.error(err);
            return '';
        }
    }

    public async cleanGiftingToForAll(): Promise<void> {
        let users = await this.findAll();
        for (let user of users) {
            // to-do: enable this? Probably needs some try-catch around it in case of non-decryptable secrets.
            // const giftingToName = await this.encryptionService.decryptGiftingTo(user);
            // const giftingToUser = await this.getByName(giftingToName);
            // user.lastYearGiftingToId = giftingToUser?.id ?? null;

            user.giftingTo = '';
            user.giftingToDebug = '';
            user.decryptionCode = '';
            user.iv = '';
            await this.updateUser(user.id, new AssignUserDto(user)).catch(err => console.error(err));
        }
    }
}