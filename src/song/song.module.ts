import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { SharedSong } from './entities/shared-song.entity';
import { SongHistory } from './entities/song-history.entity';
import { SongService } from './song.service';
import { SongGateway } from './song.gateway';
import { UserModule } from 'src/user/user.module';

@Module({
    imports: [
        SequelizeModule.forFeature([SharedSong, SongHistory]),
        UserModule,
    ],
    providers: [SongService, SongGateway],
    exports: [SongService],
})
export class SongModule {}
