import {
    BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Req, Res,
    UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin, CurrentGroupId } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { DossierService } from 'src/dossier/dossier.service';
import { DossierAssetKind } from 'src/dossier/entities/dossier.entity';
import { sendAsset } from 'src/dossier/dossier.controller';
import { AuditService } from 'src/audit/audit.service';
import { ParticipantsService } from '../participants.service';
import { readString } from './input';
import { detectAssetType } from 'src/dossier/file-type';

const MAX_ASSET_BYTES = 20 * 1024 * 1024;

/** Shape of a multer memory-storage upload, declared locally to avoid a types dependency. */
interface UploadedAsset {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
}

@Controller('api/admin/participants')
@UseGuards(AdminGuard)
export class ParticipantsController {
    constructor(
        private readonly participantsService: ParticipantsService,
        private readonly dossierService: DossierService,
        private readonly auditService: AuditService,
    ) { }

    @Get()
    list(@CurrentGroupId() groupId: number) {
        return this.participantsService.list(groupId);
    }

    @Get(':id')
    detail(@CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        return this.participantsService.detail(groupId, id);
    }

    @Post()
    create(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Body() body: any) {
        return this.participantsService.create(admin, groupId, body);
    }

    @Patch(':id')
    update(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.participantsService.update(admin, groupId, id, body);
    }

    @Delete(':id')
    remove(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        return this.participantsService.remove(admin, groupId, id);
    }

    /** The participant's personal link contains their secret code, so every look is logged. */
    @Get(':id/link')
    async link(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        const user = await this.participantsService.require(groupId, id);
        if (!user.decryptionCode) {
            throw new BadRequestException('There is no link until the draw has been run');
        }
        await this.auditService.log(admin, {
            groupId,
            action: 'participant.link_viewed', entityType: 'participant', entityId: id,
            summary: `Copied ${user.name}'s personal link`,
        });
        const host = (process.env.HOST ?? '').replace(/\/+$/, '');
        return { url: `${host}/?code=${encodeURIComponent(user.decryptionCode)}` };
    }

    /** Reveals who the participant is gifting to. Hidden by default in the panel, and every look is logged. */
    @Get(':id/recipient')
    async recipient(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        const { user, recipientName, recipientId } = await this.participantsService.recipient(groupId, id);
        await this.auditService.log(admin, {
            groupId,
            action: 'participant.recipient_viewed', entityType: 'participant', entityId: id,
            summary: `Revealed who ${user.name} is gifting to`,
        });
        return { name: recipientName, id: recipientId };
    }

    /** Who could give to this latecomer, for adding them to the existing draw. */
    @Get(':id/draw-options')
    drawOptions(@CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        return this.participantsService.drawOptions(groupId, id);
    }

    /** Adds a latecomer to the existing draw without redrawing anyone else. */
    @Post(':id/add-to-draw')
    @HttpCode(200)
    addToDraw(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.participantsService.addToDraw(admin, groupId, id, body);
    }

    /** Who this participant could be set to give to, for choosing their recipient by hand. */
    @Get(':id/assign-options')
    assignOptions(@CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number) {
        return this.participantsService.assignOptions(groupId, id);
    }

    /** Sets who this participant gives to in the existing draw, re-wiring as few others as possible. */
    @Post(':id/assign-recipient')
    @HttpCode(200)
    assignRecipient(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.participantsService.assignRecipient(admin, groupId, id, body);
    }

    /** Codename, mission brief and the facts list: everything text in the dossier. */
    @Put(':id/dossier')
    async saveDossier(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        const user = await this.participantsService.require(groupId, id);
        const codename = readString(body, 'codename', { max: 100 });
        const missionBrief = readString(body, 'missionBrief', { max: 5000 });
        const facts = readString(body, 'facts', { max: 5000 });
        const before = await this.dossierService.getSummary(id);
        await this.dossierService.saveText(id, {
            codename: codename ?? before.codename,
            missionBrief: missionBrief ?? before.missionBrief,
        });
        if (facts !== undefined && facts !== (user.interestingFacts ?? '')) {
            await this.participantsService.update(admin, groupId, id, { interestingFacts: facts });
        }
        const changed = [
            codename !== undefined && codename !== before.codename ? 'codename' : null,
            missionBrief !== undefined && missionBrief !== before.missionBrief ? 'mission brief' : null,
        ].filter(Boolean);
        if (changed.length) {
            await this.auditService.log(admin, {
                groupId, action: 'dossier.update', entityType: 'participant', entityId: id,
                summary: `Edited ${user.name}'s dossier: ${changed.join(', ')}`,
            });
        }
        return this.participantsService.detail(groupId, id);
    }

    @Get(':id/dossier/:kind')
    async previewAsset(
        @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Param('kind') kind: string,
        @Req() request: Request, @Res() response: Response,
    ) {
        const assetKind = parseKind(kind);
        await this.participantsService.require(groupId, id);
        return sendAsset(request, response, await this.dossierService.getAsset(id, assetKind));
    }

    @Post(':id/dossier/:kind')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ASSET_BYTES, files: 1, fields: 0, parts: 2 } }))
    async uploadAsset(
        @CurrentAdmin() admin: User,
        @CurrentGroupId() groupId: number,
        @Param('id', ParseIntPipe) id: number,
        @Param('kind') kind: string,
        @UploadedFile() file: UploadedAsset | undefined,
    ) {
        const assetKind = parseKind(kind);
        if (!file || !file.buffer || file.size === 0) {
            throw new BadRequestException('No file uploaded');
        }
        // The declared mimetype is client-controlled (an "image" can be SVG with script in it):
        // store only allowed formats, with the type detected from the content.
        const detectedType = detectAssetType(file.buffer, assetKind);
        if (!detectedType) {
            throw new BadRequestException(
                assetKind === 'photo'
                    ? 'Unsupported image: use JPEG, PNG, GIF, WebP, AVIF or HEIC.'
                    : 'Unsupported audio: use MP3, OGG, WAV, FLAC, WebM or M4A.',
            );
        }
        const user = await this.participantsService.require(groupId, id);
        await this.dossierService.saveAsset(id, assetKind, file.buffer, detectedType);
        await this.auditService.log(admin, {
            groupId,
            action: 'dossier.upload', entityType: 'participant', entityId: id,
            summary: `Uploaded a ${assetKind} for ${user.name}`,
            details: { bytes: file.size, mimeType: detectedType, fileName: file.originalname.slice(0, 200) },
        });
        return this.participantsService.detail(groupId, id);
    }

    @Delete(':id/dossier/:kind')
    async deleteAsset(@CurrentAdmin() admin: User, @CurrentGroupId() groupId: number, @Param('id', ParseIntPipe) id: number, @Param('kind') kind: string) {
        const assetKind = parseKind(kind);
        const user = await this.participantsService.require(groupId, id);
        await this.dossierService.deleteAsset(id, assetKind);
        await this.auditService.log(admin, {
            groupId,
            action: 'dossier.remove', entityType: 'participant', entityId: id,
            summary: `Removed ${user.name}'s ${assetKind}`,
        });
        return this.participantsService.detail(groupId, id);
    }
}

function parseKind(kind: string): DossierAssetKind {
    if (kind === 'photo' || kind === 'audio') {
        return kind;
    }
    throw new BadRequestException('Unknown asset kind');
}
