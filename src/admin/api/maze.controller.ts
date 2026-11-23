import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin } from 'src/auth/admin-session';
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
    async summary() {
        const [summary, board] = await Promise.all([this.mazeService.adminSummary(), this.mazeService.board(null, { detailed: true })]);
        return { ...summary, board };
    }

    @Delete()
    async reset(@CurrentAdmin() admin: User) {
        const removed = await this.mazeService.reset();
        await this.auditService.log(admin, {
            action: 'maze.reset',
            summary: `Reset the maze scoreboard (${removed} games removed)`,
            details: { removed },
        });
        return { removed };
    }
}
