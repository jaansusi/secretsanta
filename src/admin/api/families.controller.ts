import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { FamiliesService } from '../families.service';

@Controller('api/admin/families')
@UseGuards(AdminGuard)
export class FamiliesController {
    constructor(private readonly familiesService: FamiliesService) { }

    @Get()
    list(@CurrentGroupId() groupId: number) {
        return this.familiesService.list(groupId);
    }

    @Post()
    create(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        return this.familiesService.create(admin, groupId, body);
    }

    @Patch(':id')
    rename(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.familiesService.rename(admin, groupId, id, body);
    }

    @Put(':id/members')
    setMembers(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.familiesService.setMembers(admin, groupId, id, body);
    }

    @Delete(':id')
    remove(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        return this.familiesService.remove(admin, groupId, id);
    }
}
