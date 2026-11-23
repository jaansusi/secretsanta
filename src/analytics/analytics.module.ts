import { Logger, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { User } from 'src/user/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
    imports: [SequelizeModule.forFeature([AnalyticsEvent, User])],
    controllers: [AnalyticsController],
    providers: [AnalyticsService, Logger],
    exports: [AnalyticsService],
})
export class AnalyticsModule { }
