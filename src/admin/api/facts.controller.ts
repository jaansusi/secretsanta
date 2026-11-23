import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard, SuperAdminOnly } from 'src/auth/admin.guard';
import { CurrentAdmin, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { AgencyFactsService } from 'src/dossier/agency-facts.service';

/**
 * Agency facts, edited inline in a table: small requests, each answered with the fresh list. The facts are
 * shared by every group, so only the super admin edits them; "shown to" lists the current group's participants.
 */
@Controller('api/admin/facts')
@UseGuards(AdminGuard)
@SuperAdminOnly()
export class FactsController {
    constructor(private readonly agencyFactsService: AgencyFactsService) { }

    @Get()
    list(@CurrentGroupId() groupId: number) {
        return this.agencyFactsService.list(groupId);
    }

    @Post()
    async create(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        const ids = await this.agencyFactsService.create(admin, body);
        return { ids, ...(await this.agencyFactsService.list(groupId)) };
    }

    @Patch(':id')
    async update(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        await this.agencyFactsService.update(admin, id, body);
        return this.agencyFactsService.list(groupId);
    }

    @Delete(':id')
    async remove(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        const removed = await this.agencyFactsService.remove(admin, id);
        return { removed, ...(await this.agencyFactsService.list(groupId)) };
    }
}
