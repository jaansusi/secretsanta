import { Body, Controller, Delete, Get, Post, Render, Req } from '@nestjs/common';
import { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { FamilyService } from 'src/family/family.service';
import { Family } from 'src/family/entities/family.entity';
import { EncryptionStrategy } from 'src/encryption/encryption.service';
import { CommunicationStrategy } from './entities/user.entity';
import { ReadUserDto } from './dto/read-user.dto';

@Controller()
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly familyService: FamilyService,
    ) { }

    @Get('admin/users')
    @Render('users')
    async displayUsersPage(@Req() request: Request): Promise<any> {
        if (request.cookies['santa_auth']) {
            const id = request.cookies['santa_auth'];
            let requestUser = await this.userService.getById(id);
            if (requestUser && requestUser.isAdmin) {
                const users = await this.userService.findAll({ order: [['name', 'ASC']], include: [{ model: Family }] });
                let usersDto = users.map(user => new ReadUserDto(user));
                usersDto.forEach(user => {
                    if (user.lastYearGiftingToId) {
                        let lastYearGiftingTo = users.find(u => u.id === user.lastYearGiftingToId);
                        if (lastYearGiftingTo) {
                            user.lastYearGiftingToName = lastYearGiftingTo.name;
                        }
                    }
                });
                let encryptionStrategies = Object.keys(EncryptionStrategy).map(key => EncryptionStrategy[key as keyof typeof EncryptionStrategy]);
                let communicationStrategies = Object.keys(CommunicationStrategy).map(key => CommunicationStrategy[key as keyof typeof CommunicationStrategy]);
                let families = await this.familyService.findAll();
                return { users: usersDto, isAdmin: true, encryptionStrategies: encryptionStrategies, communicationStrategies: communicationStrategies, families: families, usersForLastYear: users.map(function(user){return {id: user.id, name: user.name}}) };
            }
        }
        return {};
    }

    @Get('user')
    async getUsers() {
        return this.userService.findAll();
    }

    @Get('user/:id')
    async getUser(@Req() request: Request): Promise<ReadUserDto> {
        const user = await this.userService.getById(parseInt(request.params.id));
        if (!user) {
            throw new Error('User not found');
        }
        let userDto = new ReadUserDto(user);
        return userDto;
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
