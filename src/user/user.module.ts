import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from './entities/user.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { FamilyModule } from 'src/family/family.module';

@Module({
  controllers: [UserController],
  imports: [SequelizeModule.forFeature([User]), FamilyModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
