import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { AuditService } from 'src/audit/audit.service';
import { MazeService } from 'src/maze/maze.service';

/** Admin side of the maze minigame: the leaderboard and a reset (e.g. after testing). */
@Controller('api/admin/maze')
@UseGuards(AdminGuard)
export class MazeAdminController {
    constructor(
        private readonly mazeService: MazeService,
        private readonly auditService: AuditService,
    ) { }

    @Get()
    async summary(@CurrentGroupId() groupId: number) {
        const [summary, board] = await Promise.all([this.mazeService.adminSummary(groupId), this.mazeService.board(groupId, null, { detailed: true })]);
        return { ...summary, board };
    }

    @Delete()
    async reset(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number) {
        const removed = await this.mazeService.reset(groupId);
        await this.auditService.log(admin, {
            groupId,
            action: 'maze.reset',
            summary: `Reset the maze scoreboard (${removed} games removed)`,
            details: { removed },
        });
        return { removed };
    }
}
