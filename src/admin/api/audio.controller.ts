import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard, SuperAdminOnly } from 'src/auth/admin.guard';
import { CurrentAdmin, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { GenerationScope, SantaAudioService } from 'src/santa-audio/santa-audio.service';
import { readOptionalId } from './input';

const SCOPES: GenerationScope['scope'][] = ['outdated', 'line', 'participant', 'clip'];

function readScope(groupId: number, body: any): GenerationScope {
    const scope = SCOPES.includes(body?.scope) ? body.scope : 'outdated';
    return {
        scope,
        groupId,
        lineId: readOptionalId(body, 'lineId') ?? undefined,
        userId: readOptionalId(body, 'userId') ?? undefined,
        force: body?.force === true,
    };
}

/** Santa's lines are shared by every group and generating clips costs money: the super admin only. */
@Controller('api/admin/audio')
@UseGuards(AdminGuard)
@SuperAdminOnly()
export class AudioController {
    constructor(private readonly santaAudioService: SantaAudioService) { }

    @Get()
    library(@CurrentGroupId() groupId: number) {
        return this.santaAudioService.library(groupId);
    }

    @Post('lines')
    async createLine(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        await this.santaAudioService.createLine(admin, body?.kind, body?.text);
        return this.santaAudioService.library(groupId);
    }

    @Patch('lines/:id')
    async updateLine(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        await this.santaAudioService.updateLine(admin, id, body?.text);
        return this.santaAudioService.library(groupId);
    }

    @Post('lines/:id/move')
    async moveLine(@CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        await this.santaAudioService.moveLine(id, body?.direction);
        return this.santaAudioService.library(groupId);
    }

    @Delete('lines/:id')
    async deleteLine(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        await this.santaAudioService.deleteLine(admin, id);
        return this.santaAudioService.library(groupId);
    }

    @Delete('clips/:id')
    async deleteClip(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        await this.santaAudioService.deleteClip(admin, id);
        return this.santaAudioService.library(groupId);
    }

    /** How many clips and characters (ElevenLabs bills per character) a generation would use. */
    @Post('preview')
    preview(@CurrentGroupId() groupId: number, @Body() body: any) {
        return this.santaAudioService.preview(readScope(groupId, body));
    }

    @Post('generate')
    generate(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        return this.santaAudioService.start(admin, readScope(groupId, body));
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
