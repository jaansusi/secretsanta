import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Setting } from './entities/setting.entity';
import { SettingsService } from './settings.service';

@Module({
    imports: [SequelizeModule.forFeature([Setting])],
    providers: [SettingsService],
    exports: [SettingsService],
})
export class SettingsModule { }
