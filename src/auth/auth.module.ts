import { Module, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './google.strategy';
import { UserModule } from 'src/user/user.module';

@Module({
    controllers: [AuthController],
    imports: [UserModule],
    providers: [AuthService, GoogleStrategy, Logger],
    exports: [AuthService],
})
export class AuthModule { }
