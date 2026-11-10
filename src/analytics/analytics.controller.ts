import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { CLIENT_EVENT_TYPES, EventType } from './event-types';
import { SessionService } from 'src/auth/session.service';

/** Beacon endpoint for the few events only the browser can see (e.g. Santa's audio finishing). */
@Controller('track')
export class AnalyticsController {
    constructor(
        private readonly analyticsService: AnalyticsService,
        private readonly sessionService: SessionService,
    ) { }

    @Post()
    @HttpCode(204)
    async track(@Req() request: Request, @Body() body: { type?: string }) {
        const type = body?.type as EventType;
        if (!CLIENT_EVENT_TYPES.includes(type)) {
            throw new BadRequestException('Unknown event');
        }
        // Attributed via the signed session only, so nobody can file events under someone else's name.
        await this.analyticsService.track(type, request, { userId: this.sessionService.readUserId(request) });
    }
}
