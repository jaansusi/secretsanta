import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRequest } from './admin-session';
import { AdminAccessService } from './admin-access.service';

const SUPER_ADMIN_ONLY = 'superAdminOnly';

/** Restricts a handler or controller guarded by AdminGuard to the super admin (ADMIN_EMAIL). */
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_ONLY, true);

/**
 * Allows the request only with a valid signed admin session for someone who currently manages at least one
 * group, and leaves the admin context (including the group being managed) on the request.
 */
@Injectable()
export class AdminGuard implements CanActivate {
    constructor(
        private readonly adminAccess: AdminAccessService,
        private readonly reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AdminRequest>();
        const adminContext = await this.adminAccess.resolve(request);
        if (!adminContext) {
            throw new UnauthorizedException('Admin session required');
        }
        const superOnly = this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_ONLY, [context.getHandler(), context.getClass()]);
        if (superOnly && !adminContext.isSuperAdmin) {
            throw new ForbiddenException('Only the site organiser can do this');
        }
        request.adminContext = adminContext;
        return true;
    }
}
