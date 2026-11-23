import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Group } from 'src/group/entities/group.entity';
import { SettingsService } from './settings.service';

@Module({
    imports: [SequelizeModule.forFeature([Group])],
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SettingsModule { }
