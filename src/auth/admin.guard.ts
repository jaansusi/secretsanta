import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from 'src/user/user.service';
import { AdminRequest, adminSessionUserId } from './admin-session';

/** Allows the request only with a valid signed admin session that belongs to a current admin user. */
@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private readonly userService: UserService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AdminRequest>();
        const user = await resolveAdmin(request, this.userService);
        if (!user) {
            throw new UnauthorizedException('Admin session required');
        }
        request.admin = user;
        return true;
    }
}

export async function resolveAdmin(request: AdminRequest, userService: UserService) {
    const id = adminSessionUserId(request);
    if (id === null) {
        return null;
    }
    const user = await userService.getById(id);
    return user && user.isAdmin ? user : null;
}
