import { Injectable } from '@nestjs/common';
import { User } from 'src/user/entities/user.entity';
import { AssignUserDto } from 'src/user/dto/assign-user.dto';
import * as crypto from 'crypto';


export enum EncryptionStrategy {
    CODE = 'code',
    KEY = 'keypair',
}


@Injectable()
export class EncryptionService {

    public async encryptGiftingTo(user: User, giftingTo: string): Promise<AssignUserDto> {
        switch (user.encryptionStrategy) {
            case EncryptionStrategy.CODE:
                return this.encryptWithCode(giftingTo, user.id.toString());
            case EncryptionStrategy.KEY:
                return this.encryptWithPublicKey(giftingTo);
            default:
                throw new Error('Invalid encryption strategy');
        }
    }

    public decryptGiftingTo(user: User): string {
        switch (user.encryptionStrategy) {
            case EncryptionStrategy.CODE:
                if (!user.decryptionCode) {
                    throw new Error('Trying to decrypt using code strategy, user does not have decryption code!');
                }
                return this.decryptWithCode(user.giftingTo, user.decryptionCode, user.id.toString(), user.iv);
            case EncryptionStrategy.KEY:
                throw new Error('KEY decryption can not be done server-side');
            default:
                throw new Error('Invalid encryption strategy');
        }
    }

    private encryptWithCode(input: string, salt: string): AssignUserDto {
        // Generate a cryptographically secure random password of at least 26 characters
        const password = crypto.randomBytes(20).toString('base64').substring(0, 26);
        // Derive a key using PBKDF2
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        // Generate a random Initialization Vector
        const iv = crypto.randomBytes(16);
        // Create a cipher object
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        // Encrypt the value
        let encrypted = cipher.update(input, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        let assignUserDto = new AssignUserDto();
        assignUserDto.iv = iv.toString('hex');
        assignUserDto.decryptionCode = password;
        // Encrypt the giftingTo field with the decryption code
        assignUserDto.giftingTo = encrypted;
        return assignUserDto;
    }

    private encryptWithPublicKey(key: string): AssignUserDto {
        //to-do: implement encryption
        throw new Error('KEY encryption is not implemented');
    }

    private decryptWithCode(encryptedData: string, password: string, salt: string, ivHex: string): string {
        if (!password) {
            throw new Error('Trying to decrypt using code strategy, user does not have decryption code!');
        }
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        // Convert IV from hex to Buffer
        const iv = Buffer.from(ivHex, 'hex');
        // Create a decipher object
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        // Decrypt the data
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}
