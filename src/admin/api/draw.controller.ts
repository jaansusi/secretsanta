import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { AuditService } from 'src/audit/audit.service';
import { DrawService } from '../draw.service';

/** Destructive actions require the client to echo a confirmation word, so a stray request cannot redraw. */
function requireConfirmation(body: any, word: string) {
    if (body?.confirm !== word) {
        throw new BadRequestException(`Type ${word} to confirm`);
    }
}

@Controller('api/admin/draw')
@UseGuards(AdminGuard)
export class DrawController {
    constructor(
        private readonly drawService: DrawService,
        private readonly auditService: AuditService,
    ) { }

    @Get()
    async status(@CurrentGroupId() groupId: number) {
        const [status, constraints] = await Promise.all([this.drawService.status(groupId), this.drawService.constraints(groupId)]);
        return { ...status, constraints };
    }

    @Post('run')
    run(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        requireConfirmation(body, 'DRAW');
        return this.drawService.run(admin, groupId);
    }

    @Post('clear')
    clear(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        requireConfirmation(body, 'CLEAR');
        return this.drawService.clear(admin, groupId);
    }

    @Post('rollover')
    rollover(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        requireConfirmation(body, 'NEW SEASON');
        return this.drawService.rollover(admin, groupId);
    }

    /** Personal links contain each participant's secret code, so every look is logged. */
    @Get('links')
    async links(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number) {
        const links = await this.drawService.links(groupId);
        await this.auditService.log(admin, {
            groupId,
            action: 'draw.links_viewed',
            summary: 'Viewed personal links',
            details: { count: links.filter(link => link.url).length },
        });
        return links;
    }
}
