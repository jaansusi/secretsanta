import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Group } from 'src/group/entities/group.entity';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { AuditModule } from 'src/audit/audit.module';
import { SettingsModule } from 'src/settings/settings.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';
import { SignupController } from './signup.controller';
import { SignupService } from './signup.service';

@Module({
    imports: [SequelizeModule.forFeature([Group, User, Family]), AuditModule, SettingsModule, AnalyticsModule],
    controllers: [SignupController],
    providers: [SignupService],
    exports: [SignupService],
})
export class SignupModule { }
