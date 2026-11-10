import { BadRequestException, Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin } from 'src/auth/admin-session';
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
    me(@CurrentAdmin() admin: User) {
        return { id: admin.id, name: admin.name, email: admin.email, timeZone: REPORT_TIME_ZONE, eventTypes: EVENT_TYPES };
    }

    @Get('overview')
    overview() {
        return this.overviewService.overview();
    }

    /** from/to are calendar days (YYYY-MM-DD), both inclusive. Defaults to the last 30 days. */
    @Get('analytics')
    analytics(@Query('from') from?: string, @Query('to') to?: string, @Query('excludeAdmins') excludeAdmins?: string) {
        const end = to ? parseDay(to, 'to').getTime() + DAY : Date.now();
        const start = from ? parseDay(from, 'from').getTime() : end - 30 * DAY;
        if (start >= end) {
            throw new BadRequestException('from must be before to');
        }
        if (end - start > 400 * DAY) {
            throw new BadRequestException('Choose a range of at most 400 days');
        }
        return this.analyticsService.report({ from: new Date(start), to: new Date(end), excludeAdmins: excludeAdmins === 'true' });
    }

    @Get('events')
    events(@Query() query: any) {
        const userId = parseInt(query.userId, 10);
        return this.analyticsService.recentEvents({
            ...readPaging(query),
            type: typeof query.type === 'string' && query.type in EVENT_TYPES ? query.type : undefined,
            userId: Number.isFinite(userId) ? userId : undefined,
        });
    }

    @Get('audit')
    audit(@Query() query: any) {
        return this.auditService.list({
            ...readPaging(query),
            entityType: typeof query.entityType === 'string' && query.entityType ? query.entityType : undefined,
        });
    }

    @Get('settings')
    settings() {
        return { ...this.settingsService.get(), letterUrlFallback: process.env.GOOGLE_DOC_LETTER_LINK || '' };
    }

    @Put('settings')
    async saveSettings(@CurrentAdmin() admin: User, @Body() body: any) {
        const { settings, changed } = await this.settingsService.update(body);
        if (changed.length) {
            await this.auditService.log(admin, {
                action: 'settings.update',
                entityType: 'settings',
                summary: changed.includes('revealOpen')
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
