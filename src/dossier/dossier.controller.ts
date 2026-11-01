import {
    BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe,
    Post, Req, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { DossierService } from './dossier.service';
import { DossierAsset, SaveDossierDto } from './dto/dossier.dto';
import { DossierAssetKind } from './entities/dossier.entity';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/entities/user.entity';
import { AdminGuard } from 'src/auth/admin.guard';

const MAX_ASSET_BYTES = 20 * 1024 * 1024;

/** Shape of a multer memory-storage upload, declared locally to avoid a types dependency. */
interface UploadedAsset {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
}

@Controller('dossier')
export class DossierController {
    constructor(
        private readonly dossierService: DossierService,
        private readonly userService: UserService,
    ) { }

    // --- Reveal page: assets of the current Santa's recipient ---

    @Get('photo')
    async recipientPhoto(@Req() request: Request, @Res() response: Response) {
        return this.sendAsset(response, await this.getRecipientAsset(request, 'photo'));
    }

    @Get('audio')
    async recipientAudio(@Req() request: Request, @Res() response: Response) {
        return this.sendAsset(response, await this.getRecipientAsset(request, 'audio'));
    }

    // --- Admin: manage dossiers ---

    @Get('admin/:userId')
    @UseGuards(AdminGuard)
    async summary(@Param('userId', ParseIntPipe) userId: number) {
        return this.dossierService.getSummary(userId);
    }

    @Post('admin/:userId')
    @UseGuards(AdminGuard)
    async saveText(@Param('userId', ParseIntPipe) userId: number, @Body() dto: SaveDossierDto) {
        await this.requireUser(userId);
        return this.dossierService.saveText(userId, dto);
    }

    @Get('admin/:userId/:kind')
    @UseGuards(AdminGuard)
    async previewAsset(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('kind') kind: string,
        @Res() response: Response,
    ) {
        return this.sendAsset(response, await this.dossierService.getAsset(userId, this.parseKind(kind)));
    }

    @Post('admin/:userId/:kind')
    @UseGuards(AdminGuard)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ASSET_BYTES, files: 1 } }))
    async uploadAsset(
        @Param('userId', ParseIntPipe) userId: number,
        @Param('kind') kind: string,
        @UploadedFile() file: UploadedAsset | undefined,
    ) {
        const assetKind = this.parseKind(kind);
        if (!file || !file.buffer || file.size === 0) {
            throw new BadRequestException('No file uploaded');
        }
        const expectedPrefix = assetKind === 'photo' ? 'image/' : 'audio/';
        if (!file.mimetype.startsWith(expectedPrefix)) {
            throw new BadRequestException(`Expected a ${expectedPrefix}* file, got ${file.mimetype}`);
        }
        await this.requireUser(userId);
        return this.dossierService.saveAsset(userId, assetKind, file.buffer, file.mimetype);
    }

    @Delete('admin/:userId/:kind')
    @UseGuards(AdminGuard)
    async deleteAsset(@Param('userId', ParseIntPipe) userId: number, @Param('kind') kind: string) {
        return this.dossierService.deleteAsset(userId, this.parseKind(kind));
    }

    // --- helpers ---

    private parseKind(kind: string): DossierAssetKind {
        if (kind === 'photo' || kind === 'audio') {
            return kind;
        }
        throw new BadRequestException('Unknown asset kind');
    }

    private async requireUser(userId: number): Promise<User> {
        const user = await this.userService.getById(userId);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        return user;
    }

    /** The Santa is identified by the auth cookie, or by the decryption code in the URL (direct links). */
    private async resolveSanta(request: Request): Promise<User | null> {
        const cookieId = request.cookies?.['santa_auth'];
        if (cookieId) {
            const user = await this.userService.getById(cookieId);
            if (user) {
                return user;
            }
        }
        const code = request.query.code;
        if (typeof code === 'string' && code.length > 0) {
            return this.userService.getByDecryptionCode(code);
        }
        return null;
    }

    private async getRecipientAsset(request: Request, kind: DossierAssetKind): Promise<DossierAsset | null> {
        const santa = await this.resolveSanta(request);
        if (!santa) {
            return null;
        }
        const recipient = await this.dossierService.getRecipientForSanta(santa);
        if (!recipient) {
            return null;
        }
        return this.dossierService.getAsset(recipient.id, kind);
    }

    private sendAsset(response: Response, asset: DossierAsset | null) {
        if (!asset) {
            throw new NotFoundException();
        }
        response.setHeader('Content-Type', asset.mimeType);
        response.setHeader('Content-Length', asset.data.length.toString());
        response.setHeader('Cache-Control', 'private, no-store');
        response.send(asset.data);
    }
}
