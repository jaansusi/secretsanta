import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AdminGuard, SuperAdminOnly } from 'src/auth/admin.guard';
import { AdminContext, CurrentAdmin, CurrentAdminContext, selectAdminGroup } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { GroupService } from 'src/group/group.service';
import { readOptionalId } from './input';

/** Switching the group being managed (any admin), and managing the groups themselves (super admin). */
@Controller('api/admin')
@UseGuards(AdminGuard)
export class GroupsController {
    constructor(private readonly groupService: GroupService) { }

    /** Every later admin API call works on the chosen group, until another one is chosen. */
    @Post('group')
    @HttpCode(200)
    switchGroup(@CurrentAdminContext() context: AdminContext, @Body() body: any, @Res({ passthrough: true }) response: Response) {
        const groupId = readOptionalId(body, 'groupId');
        const group = context.groups.find(candidate => candidate.id === groupId);
        if (!group) {
            throw new BadRequestException('You cannot manage that group');
        }
        selectAdminGroup(response, group.id);
        return { id: group.id, name: group.name };
    }

    @Get('groups')
    @SuperAdminOnly()
    list() {
        return this.groupService.list();
    }

    @Post('groups')
    @SuperAdminOnly()
    create(@CurrentAdmin() admin: User, @Body() body: any) {
        return this.groupService.create(admin, body);
    }

    @Patch('groups/:id')
    @SuperAdminOnly()
    rename(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.groupService.rename(admin, id, body);
    }

    @Delete('groups/:id')
    @SuperAdminOnly()
    remove(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number) {
        return this.groupService.remove(admin, id);
    }
}
