import { GoogleStrategy } from './auth/google.strategy';
import { Module } from '@nestjs/common';
import { HomeController } from './home/home.controller';
import { HomeService } from './home/home.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { UserModule } from './user/user.module';
import { SequelizeModule } from '@nestjs/sequelize';
import { dataBaseConfig } from './database/database.config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { User } from './user/entities/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot(), 
    UserModule, 
    AdminModule, 
    AuthModule, 
    SequelizeModule.forRootAsync(dataBaseConfig), 
    SequelizeModule.forFeature([User])
  ],
  controllers: [HomeController, AuthController],
  providers: [HomeService, AuthService, GoogleStrategy],
})
export class AppModule { }