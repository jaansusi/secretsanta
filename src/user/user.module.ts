import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User, UserHistoricalEntry } from './entities/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { FamilyModule } from 'src/family/family.module';
import { EncryptionModule } from 'src/encryption/encryption.module';
import { DossierModule } from 'src/dossier/dossier.module';

@Module({
  controllers: [UserController],
  imports: [SequelizeModule.forFeature([User, UserHistoricalEntry]), FamilyModule, EncryptionModule, forwardRef(() => DossierModule)],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
