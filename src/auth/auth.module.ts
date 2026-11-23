import { Module, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './google.strategy';
import { UserModule } from 'src/user/user.module';
import { AnalyticsModule } from 'src/analytics/analytics.module';
import { SequelizeModule } from '@nestjs/sequelize';
import { Group } from 'src/group/entities/group.entity';
import { SettingsModule } from 'src/settings/settings.module';

@Module({
    controllers: [AuthController],
    imports: [UserModule, AnalyticsModule, SequelizeModule.forFeature([Group]), SettingsModule],
    providers: [AuthService, GoogleStrategy, Logger],
    exports: [AuthService],
})
export class AuthModule { }
