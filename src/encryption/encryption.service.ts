import { Injectable } from '@nestjs/common';
import { User } from 'src/user/entities/user.entity';
import { AssignUserDto } from 'src/user/dto/assign-user.dto';
import * as crypto from 'crypto';


export enum EncryptionStrategy {
    CODE = 'code',
    KEY = 'keypair',
}

/**
 * Stores each Santa's recipient in user.giftingTo.
 *
 * With the code strategy the name is only base64 encoded, not encrypted: it keeps names from being readable
 * at a glance in query results, nothing more. decryptionCode is the random code in the Santa's personal link.
 * Rows drawn before November 2026 hold an AES-encrypted name and a non-empty iv; they are still readable here
 * and are converted to base64 on startup (see GiftingToMigration).
 */
@Injectable()
export class EncryptionService {

    public async encryptGiftingTo(user: User, giftingTo: string): Promise<AssignUserDto> {
        switch (user.encryptionStrategy) {
            case EncryptionStrategy.CODE:
                return this.assignment(giftingTo, crypto.randomBytes(20).toString('base64').substring(0, 26));
            case EncryptionStrategy.KEY:
                return this.encryptWithPublicKey();
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
                if (this.isLegacyAssignment(user)) {
                    return this.decryptLegacy(user);
                }
                return decodeName(user.giftingTo);
            case EncryptionStrategy.KEY:
                throw new Error('KEY decryption can not be done server-side');
            default:
                throw new Error('Invalid encryption strategy');
        }
    }

    /**
     * Replaces the recipient name while keeping the Santa's existing code, so their personal link keeps
     * working (used when the recipient is renamed after the draw, and when converting old rows).
     */
    public reencryptGiftingTo(user: User, giftingTo: string): AssignUserDto {
        if (user.encryptionStrategy !== EncryptionStrategy.CODE || !user.decryptionCode) {
            throw new Error('Only code-strategy assignments can be re-encoded');
        }
        return this.assignment(giftingTo, user.decryptionCode);
    }

    /** True for an assignment still stored in the pre-November 2026 AES format. */
    public isLegacyAssignment(user: User): boolean {
        return !!user.giftingTo && !!user.iv;
    }

    private assignment(giftingTo: string, code: string): AssignUserDto {
        const assignUserDto = new AssignUserDto();
        assignUserDto.giftingTo = encodeName(giftingTo);
        assignUserDto.decryptionCode = code;
        assignUserDto.iv = '';
        return assignUserDto;
    }

    private encryptWithPublicKey(): AssignUserDto {
        //to-do: implement encryption
        throw new Error('KEY encryption is not implemented');
    }

    /** AES-256-CBC with a PBKDF2 key from the decryption code, salted with the user id. */
    private decryptLegacy(user: User): string {
        const key = crypto.pbkdf2Sync(user.decryptionCode!, user.id.toString(), 100000, 32, 'sha256');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(user.iv, 'hex'));
        let decrypted = decipher.update(user.giftingTo, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

function encodeName(name: string): string {
    return Buffer.from(name, 'utf8').toString('base64');
}

function decodeName(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString('utf8');
}
