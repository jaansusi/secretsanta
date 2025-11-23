import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SharedSong } from './entities/shared-song.entity';

@Injectable()
export class SongService {
    constructor(
        @InjectModel(SharedSong)
        private sharedSongRepository: typeof SharedSong,
    ) { }

    async getCurrentSong(): Promise<SharedSong | null> {
        const songs = await this.sharedSongRepository.findAll({
            order: [['updatedAt', 'DESC']],
            limit: 1,
        });
        return songs.length > 0 ? songs[0] : null;
    }

    async updateSong(songUrl: string, updatedBy: string): Promise<SharedSong> {
        // Get or create the shared song record
        let song = await this.getCurrentSong();
        
        if (song) {
            song.songUrl = songUrl;
            song.updatedBy = updatedBy;
            song.updatedAt = new Date();
            await song.save();
        } else {
            song = await this.sharedSongRepository.create({
                songUrl,
                updatedBy,
                updatedAt: new Date(),
            });
        }
        
        return song;
    }
}
