import { Module } from '@nestjs/common';
import { User } from '../user/entities/user.entity';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './google.strategy';
import { UserService } from 'src/user/user.service';
import { UserModule } from 'src/user/user.module';

@Module({
    controllers: [AuthController],
    imports: [UserModule],
    providers: [AuthService, GoogleStrategy],
    exports: [AuthService],
})
export class AuthModule { }
