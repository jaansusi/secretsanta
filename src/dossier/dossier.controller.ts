import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { DossierService } from './dossier.service';
import { DossierAsset } from './dto/dossier.dto';
import { DossierAssetKind } from './entities/dossier.entity';
import { UserService } from 'src/user/user.service';
import { sendBinary } from 'src/common/send-binary';
import { User } from 'src/user/entities/user.entity';

/** Reveal page: serves the dossier assets of the current Santa's recipient. Editing lives in the admin API. */
@Controller('dossier')
export class DossierController {
    constructor(
        private readonly dossierService: DossierService,
        private readonly userService: UserService,
    ) { }

    @Get('photo')
    async recipientPhoto(@Req() request: Request, @Res() response: Response) {
        return sendAsset(request, response, await this.getRecipientAsset(request, 'photo'));
    }

    @Get('audio')
    async recipientAudio(@Req() request: Request, @Res() response: Response) {
        return sendAsset(request, response, await this.getRecipientAsset(request, 'audio'));
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
}

export function sendAsset(request: Request, response: Response, asset: DossierAsset | null) {
    if (!asset) {
        throw new NotFoundException();
    }
    sendBinary(request, response, asset.data, asset.mimeType, 'private, no-store');
}
