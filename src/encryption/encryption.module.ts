import { Module, Logger } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { ConfigModule } from '@nestjs/config';


@Module({
  imports: [ConfigModule],
  providers: [EncryptionService, Logger],
  exports: [EncryptionService],
})
export class EncryptionModule {}
