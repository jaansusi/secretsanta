import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { AdminContext, CurrentAdmin, CurrentAdminContext, CurrentGroupId } from 'src/auth/admin-session';
import { AnalyticsService, REPORT_TIME_ZONE } from 'src/analytics/analytics.service';
import { User } from 'src/user/entities/user.entity';
import { AuditService } from 'src/audit/audit.service';
import { MazeService } from 'src/maze/maze.service';

/** Admin side of the maze minigame: the leaderboard, the data download and a reset (e.g. after testing). */
@Controller('api/admin/maze')
@UseGuards(AdminGuard)
export class MazeAdminController {
    constructor(
        private readonly mazeService: MazeService,
        private readonly auditService: AuditService,
        private readonly analyticsService: AnalyticsService,
    ) { }

    @Get()
    async summary(@CurrentGroupId() groupId: number) {
        const [summary, board] = await Promise.all([this.mazeService.adminSummary(groupId), this.mazeService.board(groupId, null, { detailed: true })]);
        return { ...summary, board };
    }

    /**
     * Everything recorded about the maze in this group: all games (archived ones too) with their event logs,
     * and the maze analytics events (opened, started, finished) with device details.
     */
    @Get('export')
    async export(@CurrentAdminContext() context: AdminContext) {
        const groupId = context.group.id;
        const [data, analytics] = await Promise.all([
            this.mazeService.exportData(groupId),
            this.analyticsService.eventsOfTypes(groupId, ['maze_open', 'maze_start', 'maze_complete']),
        ]);
        return {
            exportedAt: new Date(),
            timeZone: REPORT_TIME_ZONE,
            group: { id: groupId, name: context.group.name },
            ...data,
            analytics,
        };
    }

    /** Clears the scoreboard. The games are archived, not deleted (see MazeService.reset). */
    @Delete()
    async reset(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number) {
        const archived = await this.mazeService.reset(groupId);
        await this.auditService.log(admin, {
            groupId,
            action: 'maze.reset',
            summary: `Reset the maze scoreboard (${archived} games archived)`,
            details: { archived },
        });
        return { archived };
    }
}
