import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TwilioService } from './twilio.service';

@Module({
    imports: [ConfigModule],
    providers: [TwilioService, Logger],
    exports: [TwilioService],
})
export class TwilioModule {}
