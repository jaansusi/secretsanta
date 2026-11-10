import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { AgencyFactsService } from 'src/dossier/agency-facts.service';

/** Agency facts, edited inline in a table: small requests, each answered with the fresh list. */
@Controller('api/admin/facts')
@UseGuards(AdminGuard)
export class FactsController {
    constructor(private readonly agencyFactsService: AgencyFactsService) { }

    @Get()
    list() {
        return this.agencyFactsService.list();
    }

    @Post()
    async create(@CurrentAdmin() admin: User, @Body() body: any) {
        const ids = await this.agencyFactsService.create(admin, body);
        return { ids, ...(await this.agencyFactsService.list()) };
    }

    @Patch(':id')
    async update(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        await this.agencyFactsService.update(admin, id, body);
        return this.agencyFactsService.list();
    }

    @Delete(':id')
    async remove(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number) {
        const removed = await this.agencyFactsService.remove(admin, id);
        return { removed, ...(await this.agencyFactsService.list()) };
    }
}
