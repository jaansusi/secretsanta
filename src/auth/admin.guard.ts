import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { UserService } from 'src/user/user.service';

/** Allows the request only when the santa_auth cookie belongs to an admin user. */
@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private readonly userService: UserService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const id = request.cookies?.['santa_auth'];
        if (!id) {
            return false;
        }
        const user = await this.userService.getById(id);
        return !!user && user.isAdmin;
    }
}
