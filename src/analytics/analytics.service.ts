import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Request } from 'express';
import { randomBytes } from 'crypto';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { EventType, VISIT_TYPES } from './event-types';
import { isBot, parseUserAgent } from './user-agent';

const VISITOR_COOKIE = 'santa_vid';
const VISITOR_COOKIE_MAX_AGE = 400 * 24 * 60 * 60 * 1000;

/** Days and hours in reports are counted in this time zone. */
export const REPORT_TIME_ZONE = process.env.ADMIN_TIME_ZONE || 'Europe/Tallinn';

export interface TrackOptions {
    userId?: number | null;
    meta?: Record<string, unknown>;
}

export interface ReportRange {
    from: Date;
    to: Date;
    excludeAdmins: boolean;
}

export interface ParticipantActivity {
    userId: number;
    lastSeen: string | null;
    firstReveal: string | null;
    reveals: number;
    visits: number;
    briefingComplete: boolean;
    device: string | null;
}

@Injectable()
export class AnalyticsService {
    constructor(
        @InjectModel(AnalyticsEvent)
        private readonly eventRepository: typeof AnalyticsEvent,
        @InjectConnection()
        private readonly sequelize: Sequelize,
        private readonly logger: Logger,
    ) { }

    /** Records an event. Never throws: analytics must not break the site. */
    public async track(type: EventType, request: Request | null, options: TrackOptions = {}): Promise<void> {
        try {
            const userAgent = request?.headers['user-agent'];
            if (request && isBot(userAgent)) {
                return;
            }
            const parsed = parseUserAgent(userAgent);
            await this.eventRepository.create({
                type,
                userId: options.userId ?? null,
                visitorId: request ? this.visitorId(request) : null,
                path: request ? request.path : null,
                device: parsed.device,
                browser: parsed.browser,
                os: parsed.os,
                meta: options.meta ?? null,
            });
        } catch (err) {
            this.logger.warn(`Could not record analytics event ${type}: ${err.message}`);
        }
    }

    /** Reads the anonymous visitor cookie, creating it on the response when missing. */
    private visitorId(request: Request): string | null {
        const existing = request.cookies?.[VISITOR_COOKIE];
        if (typeof existing === 'string' && /^[a-f0-9]{16,64}$/.test(existing)) {
            return existing;
        }
        const id = randomBytes(12).toString('hex');
        const response = request.res;
        if (response && !response.headersSent) {
            response.cookie(VISITOR_COOKIE, id, { maxAge: VISITOR_COOKIE_MAX_AGE, httpOnly: true, sameSite: 'lax' });
            // Later events in the same request reuse it.
            request.cookies = { ...(request.cookies ?? {}), [VISITOR_COOKIE]: id };
        }
        return id;
    }

    /** Per-participant activity since a point in time (normally the latest draw). */
    public async participantActivity(since: Date | null): Promise<Map<number, ParticipantActivity>> {
        const rows = await this.sequelize.query<any>(`
            SELECT "userId",
                   MAX("createdAt") AS "lastSeen",
                   MIN("createdAt") FILTER (WHERE type = 'reveal') AS "firstReveal",
                   COUNT(*) FILTER (WHERE type = 'reveal')::int AS reveals,
                   COUNT(*) FILTER (WHERE type IN (:visitTypes))::int AS visits,
                   BOOL_OR(type = 'briefing_complete') AS "briefingComplete",
                   (ARRAY_AGG(device ORDER BY "createdAt" DESC))[1] AS device
            FROM analytics_event
            WHERE "userId" IS NOT NULL AND "createdAt" >= :since
            GROUP BY "userId"`, {
            replacements: { since: since ?? new Date(0), visitTypes: VISIT_TYPES },
            type: QueryTypes.SELECT,
        });
        const result = new Map<number, ParticipantActivity>();
        for (const row of rows) {
            result.set(row.userId, {
                userId: row.userId,
                lastSeen: row.lastSeen,
                firstReveal: row.firstReveal,
                reveals: row.reveals,
                visits: row.visits,
                briefingComplete: !!row.briefingComplete,
                device: row.device,
            });
        }
        return result;
    }

    public async recentEvents(options: { limit: number; offset: number; type?: string; userId?: number }) {
        const where: string[] = [];
        const replacements: Record<string, unknown> = { limit: options.limit, offset: options.offset };
        if (options.type) {
            where.push('e.type = :type');
            replacements.type = options.type;
        }
        if (options.userId) {
            where.push('e."userId" = :userId');
            replacements.userId = options.userId;
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const items = await this.sequelize.query<any>(`
            SELECT e.id, e.type, e."userId", u.name AS "userName", e.device, e.browser, e.os, e.path, e.meta, e."createdAt"
            FROM analytics_event e LEFT JOIN "user" u ON u.id = e."userId"
            ${whereSql}
            ORDER BY e."createdAt" DESC, e.id DESC
            LIMIT :limit OFFSET :offset`, { replacements, type: QueryTypes.SELECT });
        const [{ total }] = await this.sequelize.query<any>(
            `SELECT COUNT(*)::int AS total FROM analytics_event e ${whereSql}`,
            { replacements, type: QueryTypes.SELECT },
        );
        return { items, total };
    }

    /** Everything the analytics page shows, scoped to one date range. */
    public async report(range: ReportRange) {
        const replacements = {
            from: range.from,
            to: range.to,
            tz: REPORT_TIME_ZONE,
            visitTypes: VISIT_TYPES,
        };
        const scope = `"createdAt" >= :from AND "createdAt" < :to` +
            (range.excludeAdmins ? ` AND ("userId" IS NULL OR "userId" NOT IN (SELECT id FROM "user" WHERE "isAdmin" = true))` : '');
        const select = (sql: string): Promise<any[]> => this.sequelize.query<any>(sql, { replacements, type: QueryTypes.SELECT });

        const [byType, daily, hourly, devices, browsers, totals, participants, participantRows] = await Promise.all([
            select(`SELECT type, COUNT(*)::int AS count, COUNT(DISTINCT "userId")::int AS users
                    FROM analytics_event WHERE ${scope} GROUP BY type`),
            select(`SELECT to_char(("createdAt" AT TIME ZONE :tz)::date, 'YYYY-MM-DD') AS day,
                           COUNT(DISTINCT COALESCE("userId"::text, "visitorId")) FILTER (WHERE type IN (:visitTypes))::int AS visitors,
                           COUNT(*) FILTER (WHERE type = 'reveal')::int AS reveals
                    FROM analytics_event WHERE ${scope} GROUP BY 1 ORDER BY 1`),
            select(`SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE :tz)::int AS hour, COUNT(*)::int AS count
                    FROM analytics_event WHERE ${scope} AND type IN (:visitTypes) GROUP BY 1`),
            select(`SELECT device AS name, COUNT(DISTINCT COALESCE("userId"::text, "visitorId"))::int AS count
                    FROM analytics_event WHERE ${scope} AND type IN (:visitTypes) GROUP BY 1 ORDER BY 2 DESC`),
            select(`SELECT browser AS name, COUNT(DISTINCT COALESCE("userId"::text, "visitorId"))::int AS count
                    FROM analytics_event WHERE ${scope} AND type IN (:visitTypes) GROUP BY 1 ORDER BY 2 DESC`),
            select(`SELECT COUNT(DISTINCT COALESCE("userId"::text, "visitorId")) FILTER (WHERE type IN (:visitTypes))::int AS visitors,
                           COUNT(DISTINCT "userId") FILTER (WHERE type IN (:visitTypes))::int AS "participantsVisited",
                           COUNT(DISTINCT "userId") FILTER (WHERE type = 'reveal')::int AS "participantsRevealed",
                           COUNT(DISTINCT "userId") FILTER (WHERE type = 'briefing_complete')::int AS "participantsHeardSanta",
                           COUNT(*) FILTER (WHERE type IN (:visitTypes))::int AS visits
                    FROM analytics_event WHERE ${scope}`),
            select(`SELECT COUNT(*)::int AS count FROM "user"` + (range.excludeAdmins ? ` WHERE "isAdmin" = false` : '')),
            select(`SELECT u.id AS "userId", u.name,
                           COUNT(e.id) FILTER (WHERE e.type IN (:visitTypes))::int AS visits,
                           COUNT(e.id) FILTER (WHERE e.type = 'reveal')::int AS reveals,
                           BOOL_OR(e.type = 'briefing_complete') AS "heardSanta",
                           MIN(e."createdAt") FILTER (WHERE e.type = 'reveal') AS "firstReveal",
                           MAX(e."createdAt") AS "lastSeen",
                           (ARRAY_AGG(e.device ORDER BY e."createdAt" DESC) FILTER (WHERE e.id IS NOT NULL))[1] AS device
                    FROM "user" u
                    LEFT JOIN analytics_event e ON e."userId" = u.id AND e."createdAt" >= :from AND e."createdAt" < :to
                    ${range.excludeAdmins ? 'WHERE u."isAdmin" = false' : ''}
                    GROUP BY u.id, u.name ORDER BY u.name`),
        ]);

        return {
            range: { from: range.from.toISOString(), to: range.to.toISOString(), timeZone: REPORT_TIME_ZONE },
            totals: { ...totals[0], participants: participants[0].count },
            byType,
            daily: this.fillDays(daily, range),
            hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourly.find((row: any) => row.hour === hour)?.count ?? 0 })),
            devices,
            browsers,
            participants: participantRows.map((row: any) => ({ ...row, heardSanta: !!row.heardSanta })),
        };
    }

    /** Adds the days without any events, so a chart's x-axis is continuous. */
    private fillDays(rows: any[], range: ReportRange) {
        const byDay = new Map(rows.map(row => [row.day, row]));
        const days: { day: string; visitors: number; reveals: number }[] = [];
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
        const seen = new Set<string>();
        for (let t = range.from.getTime(); t < range.to.getTime(); t += 60 * 60 * 1000) {
            const day = formatter.format(new Date(t));
            if (seen.has(day)) continue;
            seen.add(day);
            const row = byDay.get(day);
            days.push({ day, visitors: row?.visitors ?? 0, reveals: row?.reveals ?? 0 });
        }
        return days;
    }
}
