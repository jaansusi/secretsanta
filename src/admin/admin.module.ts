import { Module, Logger } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { UserModule } from 'src/user/user.module';
import { EncryptionModule } from 'src/encryption/encryption.module';
import { DossierModule } from 'src/dossier/dossier.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';
import { AuditModule } from 'src/audit/audit.module';
import { SettingsModule } from 'src/settings/settings.module';
import { AdminPageController } from './admin-page.controller';
import { ParticipantsController } from './api/participants.controller';
import { FamiliesController } from './api/families.controller';
import { DrawController } from './api/draw.controller';
import { InsightsController } from './api/insights.controller';
import { DrawService } from './draw.service';
import { ParticipantsService } from './participants.service';
import { FamiliesService } from './families.service';
import { OverviewService } from './overview.service';
import { AudioController } from './api/audio.controller';
import { FactsController } from './api/facts.controller';
import { SantaAudioModule } from 'src/santa-audio/santa-audio.module';

@Module({
    imports: [
        SequelizeModule.forFeature([User, Family]),
        UserModule,
        EncryptionModule,
        DossierModule,
        AnalyticsModule,
        AuditModule,
        SettingsModule,
        SantaAudioModule,
    ],
    controllers: [AdminPageController, ParticipantsController, FamiliesController, DrawController, InsightsController, AudioController, FactsController],
    providers: [DrawService, ParticipantsService, FamiliesService, OverviewService, Logger],
})
export class AdminModule { }
