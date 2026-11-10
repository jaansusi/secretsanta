import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { DossierService } from './dossier.service';
import { DossierAsset } from './dto/dossier.dto';
import { DossierAssetKind } from './entities/dossier.entity';
import { UserService } from 'src/user/user.service';
import { sendBinary } from 'src/common/send-binary';
import { User } from 'src/user/entities/user.entity';
import { SessionService } from 'src/auth/session.service';
import { CODE_CHECK_THROTTLE } from 'src/security/throttle';
import { SERVABLE_ASSET_TYPES } from './file-type';

/** Reveal page: serves the dossier assets of the current Santa's recipient. Editing lives in the admin API. */
@Controller('dossier')
export class DossierController {
    constructor(
        private readonly dossierService: DossierService,
        private readonly userService: UserService,
        private readonly sessionService: SessionService,
    ) { }

    @Get('photo')
    @Throttle(CODE_CHECK_THROTTLE)
    async recipientPhoto(@Req() request: Request, @Res() response: Response) {
        return sendAsset(request, response, await this.getRecipientAsset(request, 'photo'));
    }

    @Get('audio')
    @Throttle(CODE_CHECK_THROTTLE)
    async recipientAudio(@Req() request: Request, @Res() response: Response) {
        return sendAsset(request, response, await this.getRecipientAsset(request, 'audio'));
    }

    /**
     * The Santa is identified by the signed session, or by the decryption code in the query string: the page
     * requests the audio in the same click that submits the code, before the session cookie exists.
     */
    private async resolveSanta(request: Request): Promise<User | null> {
        const user = await this.sessionService.getUser(request);
        if (user) {
            return user;
        }
        return this.userService.getByDecryptionCode(request.query.code);
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
}

export function sendAsset(request: Request, response: Response, asset: DossierAsset | null) {
    if (!asset) {
        throw new NotFoundException();
    }
    // Rows uploaded before content sniffing existed may carry any client-supplied type (e.g. SVG):
    // only known media types are served inline, everything else as an opaque download.
    const servable = SERVABLE_ASSET_TYPES.has(asset.mimeType);
    response.setHeader('Content-Disposition', servable ? 'inline' : 'attachment');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Even if the file is opened directly, it cannot run script or load anything.
    response.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
    sendBinary(request, response, asset.data, servable ? asset.mimeType : 'application/octet-stream', 'private, no-store');
}
