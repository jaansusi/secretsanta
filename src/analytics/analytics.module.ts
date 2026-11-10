import { Logger, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';

@Module({
    imports: [SequelizeModule.forFeature([AnalyticsEvent])],
    controllers: [AnalyticsController],
    providers: [AnalyticsService, Logger],
    exports: [AnalyticsService],
})
export class AnalyticsModule { }
