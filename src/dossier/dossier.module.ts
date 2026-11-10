import { forwardRef, Logger, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Dossier } from './entities/dossier.entity';
import { AgencyFact } from './entities/agency-fact.entity';
import { AgencyFactsService } from './agency-facts.service';
import { User } from 'src/user/entities/user.entity';
import { Setting } from 'src/settings/entities/setting.entity';
import { SettingsModule } from 'src/settings/settings.module';
import { AuditModule } from 'src/audit/audit.module';
import { DossierService } from './dossier.service';
import { DossierController } from './dossier.controller';
import { UserModule } from 'src/user/user.module';
import { EncryptionModule } from 'src/encryption/encryption.module';
import { SantaAudioModule } from 'src/santa-audio/santa-audio.module';

@Module({
    imports: [SequelizeModule.forFeature([Dossier, AgencyFact, User, Setting]), forwardRef(() => UserModule), EncryptionModule, SantaAudioModule, SettingsModule, AuditModule],
    controllers: [DossierController],
    providers: [DossierService, AgencyFactsService, Logger],
    exports: [DossierService, AgencyFactsService],
})
export class DossierModule { }
