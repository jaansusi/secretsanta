import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { CLIENT_EVENT_TYPES, EventType } from './event-types';

/** Beacon endpoint for the few events only the browser can see (e.g. Santa's audio finishing). */
@Controller('track')
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) { }

    @Post()
    @HttpCode(204)
    async track(@Req() request: Request, @Body() body: { type?: string }) {
        const type = body?.type as EventType;
        if (!CLIENT_EVENT_TYPES.includes(type)) {
            throw new BadRequestException('Unknown event');
        }
        const userId = parseInt(request.cookies?.['santa_auth'], 10);
        await this.analyticsService.track(type, request, { userId: Number.isFinite(userId) ? userId : null });
    }
}
