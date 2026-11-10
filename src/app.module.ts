import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HomeController } from './home/home.controller';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { SequelizeModule } from '@nestjs/sequelize';
import { dataBaseConfig } from './database/database.config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { EncryptionModule } from './encryption/encryption.module';
import { DossierModule } from './dossier/dossier.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SettingsModule } from './settings/settings.module';
import { SessionModule } from './auth/session.module';
import { DEFAULT_THROTTLE } from './security/throttle';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
    SessionModule,
    UserModule,
    AdminModule,
    AuthModule,
    EncryptionModule,
    DossierModule,
    AnalyticsModule,
    SettingsModule,
    SequelizeModule.forRootAsync(dataBaseConfig)
  ],
  controllers: [HomeController],
  providers: [
    Logger,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
