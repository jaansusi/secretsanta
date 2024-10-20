import { Controller, Get, Redirect, Render, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Request } from 'express';
import { UserService } from 'src/user/user.service';
import { Family } from 'src/family/entities/family.entity';
import * as crypto from 'crypto';

@Controller('admin')
export class AdminController {
    constructor(
        private readonly adminService: AdminService,
        private readonly userService: UserService,
    ) { }

    @Get()
    @Render('admin')
    async admin(@Req() request: Request): Promise<any> {
        if (request.cookies['santa_auth']) {
            const dbHash = await this.adminService.generateDbHash();

            const id = request.cookies['santa_auth'];
            let user = await this.userService.getById(id);
            if (user && user.isAdmin) {
                const users = await this.userService.findAll({ order: [['name', 'ASC']], include: [{ model: Family }] });
                try {
                    const validation = await this.adminService.validateSantas();
                    return { info: 'Admin page', isAdmin: true, users: users, dbHash: dbHash, validationResult: validation };
                } catch (err) {
                    return { info: 'Admin page', isAdmin: true, users: users, dbHash: dbHash, error: err.message };
                }
            }
        }
        return { info: 'Admin page' };
    }

    @Get('generate')
    @Redirect('/admin')
    async generateSantas(@Req() request: Request): Promise<any> {
        if (request.cookies['santa_auth']) {
            const id = request.cookies['santa_auth'];
            let user = await this.userService.getById(id);

            if (user && user.isAdmin) {
                await this.adminService.assignSantas();
                return;
            }
        }
    }
}
