import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Group } from './entities/group.entity';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { AuditModule } from 'src/audit/audit.module';
import { SettingsModule } from 'src/settings/settings.module';
import { GroupService } from './group.service';

@Module({
    imports: [SequelizeModule.forFeature([Group, User, Family]), AuditModule, SettingsModule],
    providers: [GroupService],
    exports: [GroupService],
})
export class GroupModule { }
