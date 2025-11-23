import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SharedSong } from './entities/shared-song.entity';
import { SongService } from './song.service';
import { SongGateway } from './song.gateway';
import { UserModule } from 'src/user/user.module';

@Module({
    imports: [
        SequelizeModule.forFeature([SharedSong]),
        UserModule,
    ],
    providers: [SongService, SongGateway],
    exports: [SongService],
})
export class SongModule {}
