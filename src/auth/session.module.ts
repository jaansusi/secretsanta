import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';
import { SessionService } from './session.service';

/**
 * Global so that any controller can use SessionService. It reads the User model directly,
 * which keeps it free of module dependency cycles.
 */
@Global()
@Module({
    imports: [SequelizeModule.forFeature([User])],
    providers: [SessionService],
    exports: [SessionService],
})
export class SessionModule { }
