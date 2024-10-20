import { Module } from '@nestjs/common';
import { HomeController } from './home/home.controller';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth/auth.controller';
import { UserModule } from './user/user.module';
import { SequelizeModule } from '@nestjs/sequelize';
import { dataBaseConfig } from './database/database.config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { EncryptionModule } from './encryption/encryption.module';

@Module({
  imports: [
    ConfigModule.forRoot(), 
    UserModule,
    AdminModule, 
    AuthModule, 
    EncryptionModule,
    SequelizeModule.forRootAsync(dataBaseConfig)
  ],
  controllers: [HomeController, AuthController],
  providers: [],
})
export class AppModule { }