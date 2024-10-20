import { Body, Controller, Delete, Get, Post, Render, Req } from '@nestjs/common';
import { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { FamilyService } from 'src/family/family.service';
import { Family } from 'src/family/entities/family.entity';
import { EncryptionStrategy } from 'src/encryption/encryption.service';

@Controller('admin')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly familyService: FamilyService,
    ) { }

    @Get('users')
    @Render('users')
    async displayUsersPage(@Req() request: Request): Promise<any> {
        if (request.cookies['santa_auth']) {
            const id = request.cookies['santa_auth'];
            let user = await this.userService.getById(id);
            if (user && user.isAdmin) {
                const users = await this.userService.findAll({ order: [['name', 'ASC']], include: [{ model: Family }] });
                let strategies = Object.keys(EncryptionStrategy).map(key => EncryptionStrategy[key]);
                let families = await this.familyService.findAll();
                return { users: users, isAdmin: true, strategies: strategies, families: families };
            }
        }
        return {};
    }

    @Get('user')
    async getUsers() {
        return this.userService.findAll();
    }

    @Post('user')
    async postUser(@Body() userDto: CreateUserDto) {
        return this.userService.createUser(userDto);
    }

    @Delete('user/:id')
    async deleteUser(@Req() request: Request) {
        return this.userService.deleteUser(parseInt(request.params.id));
    }
}
