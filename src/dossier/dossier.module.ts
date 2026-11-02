import { forwardRef, Logger, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Dossier } from './entities/dossier.entity';
import { DossierService } from './dossier.service';
import { DossierController } from './dossier.controller';
import { UserModule } from 'src/user/user.module';
import { EncryptionModule } from 'src/encryption/encryption.module';

@Module({
    imports: [SequelizeModule.forFeature([Dossier]), forwardRef(() => UserModule), EncryptionModule],
    controllers: [DossierController],
    providers: [DossierService, Logger],
    exports: [DossierService],
})
export class DossierModule { }
