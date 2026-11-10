import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Request, Response } from 'express';
import { sendBinary } from 'src/common/send-binary';
import { User } from 'src/user/entities/user.entity';
import { adminSessionUserId } from 'src/auth/admin-session';
import { SessionService } from 'src/auth/session.service';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { SantaClip } from './entities/santa-clip.entity';
import { SantaAudioService } from './santa-audio.service';

/**
 * Serves generated clips to the reveal page. URLs are signed (see SantaAudioService.clipUrl), so clips cannot be
 * enumerated, and they carry the generation time, so they can be cached forever.
 *
 * Intro and outro clips say no names and only need a valid URL. A name clip says a participant's name, so on
 * top of the URL it needs a session that is allowed to hear it: an admin, or that participant's own Santa.
 * A shared or leaked name-clip link therefore plays for nobody else.
 */
@Controller('santa-audio')
export class SantaAudioController {
    constructor(
        private readonly santaAudioService: SantaAudioService,
        private readonly sessionService: SessionService,
        private readonly encryptionService: EncryptionService,
        @InjectModel(User)
        private readonly userRepository: typeof User,
    ) { }

    @Get(':file')
    async clip(@Param('file') file: string, @Req() request: Request, @Res() response: Response) {
        const clip = await this.santaAudioService.getClipAudio(file);
        // 404 rather than 403, so a forbidden name clip looks the same as one that does not exist.
        if (!clip || !(await this.mayHear(request, clip))) {
            throw new NotFoundException();
        }
        // Name clips depend on who is asking, so only the browser may cache them, never a shared cache.
        const cacheControl = clip.kind === 'name' ? 'private, max-age=31536000, immutable' : 'public, max-age=31536000, immutable';
        sendBinary(request, response, clip.audio, clip.mimeType, cacheControl);
    }

    private async mayHear(request: Request, clip: SantaClip): Promise<boolean> {
        if (clip.kind !== 'name') {
            return true;
        }
        const adminId = adminSessionUserId(request);
        if (adminId !== null) {
            const admin = await this.userRepository.findByPk(adminId, { attributes: ['id', 'isAdmin'] });
            if (admin?.isAdmin) {
                return true;
            }
        }
        const santa = await this.sessionService.getUser(request);
        if (!santa || santa.encryptionStrategy !== EncryptionStrategy.CODE || !santa.giftingTo) {
            return false;
        }
        try {
            const recipientName = this.encryptionService.decryptGiftingTo(santa);
            const recipient = await this.userRepository.findOne({ where: { name: recipientName }, attributes: ['id'] });
            return !!recipient && recipient.id === clip.userId;
        } catch {
            return false;
        }
    }
}
