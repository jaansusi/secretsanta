import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { GenerationScope, SantaAudioService } from 'src/santa-audio/santa-audio.service';
import { readOptionalId } from './input';

const SCOPES: GenerationScope['scope'][] = ['outdated', 'line', 'participant', 'clip'];

function readScope(body: any): GenerationScope {
    const scope = SCOPES.includes(body?.scope) ? body.scope : 'outdated';
    return {
        scope,
        lineId: readOptionalId(body, 'lineId') ?? undefined,
        userId: readOptionalId(body, 'userId') ?? undefined,
        force: body?.force === true,
    };
}

@Controller('api/admin/audio')
@UseGuards(AdminGuard)
export class AudioController {
    constructor(private readonly santaAudioService: SantaAudioService) { }

    @Get()
    library() {
        return this.santaAudioService.library();
    }

    @Post('lines')
    async createLine(@CurrentAdmin() admin: User, @Body() body: any) {
        await this.santaAudioService.createLine(admin, body?.kind, body?.text);
        return this.santaAudioService.library();
    }

    @Patch('lines/:id')
    async updateLine(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        await this.santaAudioService.updateLine(admin, id, body?.text);
        return this.santaAudioService.library();
    }

    @Post('lines/:id/move')
    async moveLine(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
        await this.santaAudioService.moveLine(id, body?.direction);
        return this.santaAudioService.library();
    }

    @Delete('lines/:id')
    async deleteLine(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number) {
        await this.santaAudioService.deleteLine(admin, id);
        return this.santaAudioService.library();
    }

    @Delete('clips/:id')
    async deleteClip(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number) {
        await this.santaAudioService.deleteClip(admin, id);
        return this.santaAudioService.library();
    }

    /** How many clips and characters (ElevenLabs bills per character) a generation would use. */
    @Post('preview')
    preview(@Body() body: any) {
        return this.santaAudioService.preview(readScope(body));
    }

    @Post('generate')
    generate(@CurrentAdmin() admin: User, @Body() body: any) {
        return this.santaAudioService.start(admin, readScope(body));
    }

    @Get('job')
    job() {
        return this.santaAudioService.jobState();
    }

    @Post('job/cancel')
    cancel() {
        return this.santaAudioService.cancel();
    }
}
