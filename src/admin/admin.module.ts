import { Module, Logger } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UserModule } from 'src/user/user.module';
import { FamilyModule } from 'src/family/family.module';
import { EncryptionModule } from 'src/encryption/encryption.module';
import { TwilioModule } from 'src/twilio/twilio.module';

@Module({
    controllers: [AdminController],
    imports: [FamilyModule, UserModule, EncryptionModule, TwilioModule],
    providers: [AdminService, Logger],
})
export class AdminModule { }
