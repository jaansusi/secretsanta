import { Logger, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';
import { AuditModule } from 'src/audit/audit.module';
import { SantaLine } from './entities/santa-line.entity';
import { SantaClip } from './entities/santa-clip.entity';
import { SantaAudioService } from './santa-audio.service';
import { SantaAudioImport } from './santa-audio-import';
import { SantaAudioController } from './santa-audio.controller';

@Module({
    imports: [SequelizeModule.forFeature([SantaLine, SantaClip, User]), AuditModule],
    controllers: [SantaAudioController],
    providers: [SantaAudioService, SantaAudioImport, Logger],
    exports: [SantaAudioService],
})
export class SantaAudioModule { }
