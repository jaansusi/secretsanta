import { Logger, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

@Module({
    imports: [SequelizeModule.forFeature([AuditLog])],
    providers: [AuditService, Logger],
    exports: [AuditService],
})
export class AuditModule { }
