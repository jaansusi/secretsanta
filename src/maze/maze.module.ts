import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';
import { AnalyticsModule } from 'src/analytics/analytics.module';
import { UserModule } from 'src/user/user.module';
import { MazeGame } from './entities/maze-game.entity';
import { MazeGameEvent } from './entities/maze-game-event.entity';
import { MazeController } from './maze.controller';
import { MazeService } from './maze.service';

@Module({
    imports: [SequelizeModule.forFeature([MazeGame, MazeGameEvent, User]), AnalyticsModule, UserModule],
    controllers: [MazeController],
    providers: [MazeService],
    exports: [MazeService],
})
export class MazeModule { }
