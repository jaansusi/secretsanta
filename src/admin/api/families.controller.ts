import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { FamiliesService } from '../families.service';

@Controller('api/admin/families')
@UseGuards(AdminGuard)
export class FamiliesController {
    constructor(private readonly familiesService: FamiliesService) { }

    @Get()
    list() {
        return this.familiesService.list();
    }

    @Post()
    create(@CurrentAdmin() admin: User, @Body() body: any) {
        return this.familiesService.create(admin, body);
    }

    @Patch(':id')
    rename(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.familiesService.rename(admin, id, body);
    }

    @Put(':id/members')
    setMembers(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.familiesService.setMembers(admin, id, body);
    }

    @Delete(':id')
    remove(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number) {
        return this.familiesService.remove(admin, id);
    }
}
