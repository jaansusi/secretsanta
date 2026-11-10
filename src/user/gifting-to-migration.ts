import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { User } from './entities/user.entity';
import { EncryptionService } from 'src/encryption/encryption.service';

/**
 * Converts assignments stored in the old AES format (non-empty iv) to base64 on startup.
 * Each Santa keeps their code, so links already sent keep working. Safe to run repeatedly.
 */
@Injectable()
export class GiftingToMigration implements OnApplicationBootstrap {
    private readonly logger = new Logger(GiftingToMigration.name);

    constructor(
        @InjectModel(User)
        private readonly userRepository: typeof User,
        private readonly encryptionService: EncryptionService,
    ) { }

    async onApplicationBootstrap() {
        const legacy = await this.userRepository.findAll({ where: { iv: { [Op.ne]: '' } } });
        let converted = 0;
        for (const user of legacy) {
            if (!this.encryptionService.isLegacyAssignment(user)) {
                // An iv left behind without an assignment.
                await this.userRepository.update({ iv: '' }, { where: { id: user.id } });
                continue;
            }
            try {
                const name = this.encryptionService.decryptGiftingTo(user);
                await this.userRepository.update(this.encryptionService.reencryptGiftingTo(user, name), { where: { id: user.id } });
                converted++;
            } catch (err) {
                this.logger.error(`Could not convert the assignment of user ${user.id}: ${err.message}`);
            }
        }
        if (converted) {
            this.logger.log(`Converted ${converted} encrypted assignments to base64`);
        }
    }
}
