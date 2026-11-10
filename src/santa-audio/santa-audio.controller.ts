import { Controller, Get, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { sendBinary } from 'src/common/send-binary';
import { SantaAudioService } from './santa-audio.service';

/** Serves generated clips to the reveal page. URLs carry the generation time, so they can be cached forever. */
@Controller('santa-audio')
export class SantaAudioController {
    constructor(private readonly santaAudioService: SantaAudioService) { }

    @Get(':file')
    async clip(@Param('file') file: string, @Req() request: Request, @Res() response: Response) {
        const match = /^(\d+)\.mp3$/.exec(file);
        const clip = match ? await this.santaAudioService.getClipAudio(parseInt(match[1], 10)) : null;
        if (!clip) {
            throw new NotFoundException();
        }
        sendBinary(request, response, clip.audio, clip.mimeType, 'public, max-age=31536000, immutable');
    }
}
