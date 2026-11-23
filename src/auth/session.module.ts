import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';
import { Group } from 'src/group/entities/group.entity';
import { SessionService } from './session.service';
import { AdminAccessService } from './admin-access.service';
import { AdminGuard } from './admin.guard';

/**
 * Global so that any controller can use SessionService, AdminAccessService and AdminGuard. They read the
 * models directly, which keeps them free of module dependency cycles.
 */
@Global()
@Module({
    imports: [SequelizeModule.forFeature([User, Group])],
    providers: [SessionService, AdminAccessService, AdminGuard],
    exports: [SessionService, AdminAccessService, AdminGuard],
})
export class SessionModule { }
