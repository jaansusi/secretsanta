import {
    BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Req, Res,
    UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AdminGuard } from 'src/auth/admin.guard';
import { CurrentAdmin } from 'src/auth/admin-session';
import { User } from 'src/user/entities/user.entity';
import { DossierService } from 'src/dossier/dossier.service';
import { DossierAssetKind } from 'src/dossier/entities/dossier.entity';
import { sendAsset } from 'src/dossier/dossier.controller';
import { AuditService } from 'src/audit/audit.service';
import { ParticipantsService } from '../participants.service';
import { readString } from './input';

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
    list() {
        return this.participantsService.list();
    }

    @Get(':id')
    detail(@Param('id', ParseIntPipe) id: number) {
        return this.participantsService.detail(id);
    }

    @Post()
    create(@CurrentAdmin() admin: User, @Body() body: any) {
        return this.participantsService.create(admin, body);
    }

    @Patch(':id')
    update(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        return this.participantsService.update(admin, id, body);
    }

    @Delete(':id')
    remove(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number) {
        return this.participantsService.remove(admin, id);
    }

    /** The participant's personal link contains their secret code, so every look is logged. */
    @Get(':id/link')
    async link(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number) {
        const user = await this.participantsService.require(id);
        if (!user.decryptionCode) {
            throw new BadRequestException('There is no link until the draw has been run');
        }
        await this.auditService.log(admin, {
            action: 'participant.link_viewed', entityType: 'participant', entityId: id,
            summary: `Copied ${user.name}'s personal link`,
        });
        const host = (process.env.HOST ?? '').replace(/\/+$/, '');
        return { url: `${host}/?code=${encodeURIComponent(user.decryptionCode)}` };
    }

    /** Codename, mission brief and the facts list: everything text in the dossier. */
    @Put(':id/dossier')
    async saveDossier(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
        const user = await this.participantsService.require(id);
        const codename = readString(body, 'codename', { max: 100 });
        const missionBrief = readString(body, 'missionBrief', { max: 5000 });
        const facts = readString(body, 'facts', { max: 5000 });
        const before = await this.dossierService.getSummary(id);
        await this.dossierService.saveText(id, {
            codename: codename ?? before.codename,
            missionBrief: missionBrief ?? before.missionBrief,
        });
        if (facts !== undefined && facts !== (user.interestingFacts ?? '')) {
            await this.participantsService.update(admin, id, { interestingFacts: facts });
        }
        const changed = [
            codename !== undefined && codename !== before.codename ? 'codename' : null,
            missionBrief !== undefined && missionBrief !== before.missionBrief ? 'mission brief' : null,
        ].filter(Boolean);
        if (changed.length) {
            await this.auditService.log(admin, {
                action: 'dossier.update', entityType: 'participant', entityId: id,
                summary: `Edited ${user.name}'s dossier: ${changed.join(', ')}`,
            });
        }
        return this.participantsService.detail(id);
    }

    @Get(':id/dossier/:kind')
    async previewAsset(@Param('id', ParseIntPipe) id: number, @Param('kind') kind: string, @Req() request: Request, @Res() response: Response) {
        return sendAsset(request, response, await this.dossierService.getAsset(id, parseKind(kind)));
    }

    @Post(':id/dossier/:kind')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ASSET_BYTES, files: 1 } }))
    async uploadAsset(
        @CurrentAdmin() admin: User,
        @Param('id', ParseIntPipe) id: number,
        @Param('kind') kind: string,
        @UploadedFile() file: UploadedAsset | undefined,
    ) {
        const assetKind = parseKind(kind);
        if (!file || !file.buffer || file.size === 0) {
            throw new BadRequestException('No file uploaded');
        }
        const expectedPrefix = assetKind === 'photo' ? 'image/' : 'audio/';
        if (!file.mimetype.startsWith(expectedPrefix)) {
            throw new BadRequestException(`Expected a ${expectedPrefix}* file, got ${file.mimetype}`);
        }
        const user = await this.participantsService.require(id);
        await this.dossierService.saveAsset(id, assetKind, file.buffer, file.mimetype);
        await this.auditService.log(admin, {
            action: 'dossier.upload', entityType: 'participant', entityId: id,
            summary: `Uploaded a ${assetKind} for ${user.name}`,
            details: { bytes: file.size, mimeType: file.mimetype, fileName: file.originalname },
        });
        return this.participantsService.detail(id);
    }

    @Delete(':id/dossier/:kind')
    async deleteAsset(@CurrentAdmin() admin: User, @Param('id', ParseIntPipe) id: number, @Param('kind') kind: string) {
        const assetKind = parseKind(kind);
        const user = await this.participantsService.require(id);
        await this.dossierService.deleteAsset(id, assetKind);
        await this.auditService.log(admin, {
            action: 'dossier.remove', entityType: 'participant', entityId: id,
            summary: `Removed ${user.name}'s ${assetKind}`,
        });
        return this.participantsService.detail(id);
    }
}

function parseKind(kind: string): DossierAssetKind {
    if (kind === 'photo' || kind === 'audio') {
        return kind;
    }
    throw new BadRequestException('Unknown asset kind');
}
