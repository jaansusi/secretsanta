import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User, UserHistoricalEntry } from './entities/user.entity';
import { UserService } from './user.service';
import { GiftingToMigration } from './gifting-to-migration';
import { FamilyModule } from 'src/family/family.module';
import { EncryptionModule } from 'src/encryption/encryption.module';

@Module({
  imports: [SequelizeModule.forFeature([User, UserHistoricalEntry]), FamilyModule, EncryptionModule],
  providers: [UserService, GiftingToMigration],
  exports: [UserService],
})
export class UserModule {}
