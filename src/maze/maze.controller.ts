import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { SessionService } from 'src/auth/session.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { User } from 'src/user/entities/user.entity';
import { EventLog, MazeService } from './maze.service';

/** A save from the browser: the current path, the move counter, and the new part of the event log. */
type SaveBody = { moves?: unknown; actions?: unknown } & EventLog;

/**
 * The maze minigame's API (the game itself is a section of the main page, see views/partials/maze.hbs).
 * The browser plays on its own; every game is recorded:
 * it starts on the first move, its path is saved as the agent plays, and a finished path is replayed by
 * the server before it counts.
 */
@Controller('labyrint')
export class MazeController {
    constructor(
        private readonly mazeService: MazeService,
        private readonly sessionService: SessionService,
        private readonly analyticsService: AnalyticsService,
    ) { }

    /** The maze lives on the main page now; old links and bookmarks land there with the maze open. */
    @Get()
    page(@Res() response: Response) {
        return response.redirect(303, '/#labyrint');
    }

    @Get('api/state')
    async state(@Req() request: Request) {
        const user = await this.requireUser(request);
        const [results, board] = await Promise.all([this.mazeService.myResults(user.id), this.mazeService.board(user.groupId, user.id)]);
        return { levels: this.mazeService.levels(), results, board };
    }

    @Post('api/games')
    @HttpCode(200)
    async start(@Req() request: Request, @Body() body: { level?: unknown }) {
        const user = await this.requireUser(request);
        const started = await this.mazeService.start(user.id, body?.level);
        await this.analyticsService.track('maze_start', request, { userId: user.id, meta: { level: body.level, gameId: started.gameId } });
        return started;
    }

    @Post('api/games/:id/progress')
    @HttpCode(200)
    async progress(@Req() request: Request, @Param('id', ParseIntPipe) id: number, @Body() body: SaveBody) {
        const user = await this.requireUser(request);
        return this.mazeService.progress(user.id, id, body?.moves, body?.actions, body ?? {});
    }

    @Post('api/games/:id/finish')
    @HttpCode(200)
    async finish(@Req() request: Request, @Param('id', ParseIntPipe) id: number, @Body() body: SaveBody) {
        const user = await this.requireUser(request);
        const { attempt, improved } = await this.mazeService.finish(user.id, id, body?.moves, body?.actions, body ?? {});
        await this.analyticsService.track('maze_complete', request, {
            userId: user.id,
            meta: { gameId: id, moves: attempt.moves, par: attempt.par },
        });
        const [results, board] = await Promise.all([this.mazeService.myResults(user.id), this.mazeService.board(user.groupId, user.id)]);
        return { attempt, improved, results, board };
    }

    /** The hidden cheat code; answers like finish so the page shows the usual win card. */
    @Post('api/games/:id/cheat')
    @HttpCode(200)
    async cheat(@Req() request: Request, @Param('id', ParseIntPipe) id: number, @Body() body: { code?: unknown } & EventLog) {
        const user = await this.requireUser(request);
        const { attempt, improved } = await this.mazeService.cheat(user.id, id, body?.code, body ?? {});
        await this.analyticsService.track('maze_complete', request, {
            userId: user.id,
            meta: { gameId: id, moves: attempt.moves, par: attempt.par, cheat: true },
        });
        const [results, board] = await Promise.all([this.mazeService.myResults(user.id), this.mazeService.board(user.groupId, user.id)]);
        return { attempt, improved, results, board };
    }

    private async requireUser(request: Request): Promise<User> {
        const user = await this.sessionService.getUser(request);
        if (!user) {
            throw new UnauthorizedException('Logi sisse oma koodi või Google kontoga.');
        }
        return user;
    }
}
