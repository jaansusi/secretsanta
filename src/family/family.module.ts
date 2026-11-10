import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Family } from './entities/family.entity';
import { FamilyService } from './family.service';

@Module({
  imports: [SequelizeModule.forFeature([Family])],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
