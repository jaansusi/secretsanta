import { BadRequestException, Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { AdminContext, CurrentAdmin, CurrentAdminContext, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { AnalyticsService, REPORT_TIME_ZONE } from 'src/analytics/analytics.service';
import { EVENT_TYPES } from 'src/analytics/event-types';
import { AuditService } from 'src/audit/audit.service';
import { SettingsService } from 'src/settings/settings.service';
import { OverviewService } from '../overview.service';
import { readPaging } from './input';

const DAY = 24 * 60 * 60 * 1000;

/** Dashboard, analytics, activity, audio library and settings. */
@Controller('api/admin')
@UseGuards(AdminGuard)
export class InsightsController {
    constructor(
        private readonly overviewService: OverviewService,
        private readonly analyticsService: AnalyticsService,
        private readonly auditService: AuditService,
        private readonly settingsService: SettingsService,
    ) { }

    @Get('me')
    me(@CurrentAdminContext() context: AdminContext) {
        return {
            id: context.actor.id,
            name: context.actor.name,
            email: context.email,
            isSuperAdmin: context.isSuperAdmin,
            group: { id: context.group.id, name: context.group.name },
            groups: context.groups.map(group => ({ id: group.id, name: group.name })),
            timeZone: REPORT_TIME_ZONE,
            eventTypes: EVENT_TYPES,
        };
    }

    @Get('overview')
    overview(@CurrentAdminContext() context: AdminContext) {
        return this.overviewService.overview(context.group.id, context.isSuperAdmin);
    }

    /** from/to are calendar days (YYYY-MM-DD), both inclusive. Defaults to the last 30 days. */
    @Get('analytics')
    analytics(@CurrentGroupId() groupId: number, @Query('from') from?: string, @Query('to') to?: string, @Query('excludeAdmins') excludeAdmins?: string) {
        const end = to ? parseDay(to, 'to').getTime() + DAY : Date.now();
        const start = from ? parseDay(from, 'from').getTime() : end - 30 * DAY;
        if (start >= end) {
            throw new BadRequestException('from must be before to');
        }
        if (end - start > 400 * DAY) {
            throw new BadRequestException('Choose a range of at most 400 days');
        }
        return this.analyticsService.report({ groupId, from: new Date(start), to: new Date(end), excludeAdmins: excludeAdmins === 'true' });
    }

    @Get('events')
    events(@CurrentGroupId() groupId: number, @Query() query: any) {
        const userId = parseInt(query.userId, 10);
        return this.analyticsService.recentEvents({
            groupId,
            ...readPaging(query),
            type: typeof query.type === 'string' && query.type in EVENT_TYPES ? query.type : undefined,
            userId: Number.isFinite(userId) ? userId : undefined,
        });
    }

    @Get('audit')
    /** The group's activity; the super admin also sees changes to shared content (audio, facts, groups). */
    audit(@CurrentAdminContext() context: AdminContext, @Query() query: any) {
        return this.auditService.list({
            groupId: context.group.id,
            includeShared: context.isSuperAdmin,
            ...readPaging(query),
            entityType: typeof query.entityType === 'string' && query.entityType ? query.entityType : undefined,
        });
    }

    @Get('settings')
    settings(@CurrentGroupId() groupId: number) {
        return { ...this.settingsService.get(groupId), letterUrlFallback: process.env.GOOGLE_DOC_LETTER_LINK || '' };
    }

    @Put('settings')
    async saveSettings(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        const { settings, changed } = await this.settingsService.update(groupId, body);
        if (changed.length) {
            await this.auditService.log(admin, {
                groupId,
                action: 'settings.update',
                entityType: 'settings',
                summary: changed.includes('groupEnabled') && changed.length === 1
                    ? `${settings.groupEnabled ? 'Enabled' : 'Disabled'} the group in the participants' group selection`
                    : changed.includes('revealOpen')
                    ? `${settings.revealOpen ? 'Opened' : 'Closed'} missions` + (changed.length > 1 ? ` and changed ${changed.filter(k => k !== 'revealOpen').join(', ')}` : '')
                    : `Changed settings: ${changed.join(', ')}`,
                details: { changed },
            });
        }
        return { ...settings, letterUrlFallback: process.env.GOOGLE_DOC_LETTER_LINK || '' };
    }
}

/** A calendar day at midnight in the report time zone. */
function parseDay(value: string, name: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new BadRequestException(`${name} must be YYYY-MM-DD`);
    }
    const utcMidnight = new Date(`${value}T00:00:00Z`);
    // Shift by the zone's offset on that day so the day starts at local midnight.
    const local = new Date(utcMidnight.toLocaleString('en-US', { timeZone: REPORT_TIME_ZONE }));
    const utc = new Date(utcMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
    return new Date(utcMidnight.getTime() - (local.getTime() - utc.getTime()));
}
