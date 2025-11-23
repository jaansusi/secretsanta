import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { SharedSong } from './entities/shared-song.entity';
import { SongHistory } from './entities/song-history.entity';

@Injectable()
export class SongService {
    constructor(
        @InjectModel(SharedSong)
        private sharedSongRepository: typeof SharedSong,
        @InjectModel(SongHistory)
        private songHistoryRepository: typeof SongHistory,
    ) { }

    async getCurrentSong(): Promise<SharedSong | null> {
        const songs = await this.sharedSongRepository.findAll({
            order: [['updatedAt', 'DESC']],
            limit: 1,
        });
        return songs.length > 0 ? songs[0] : null;
    }

    async updateSong(songUrl: string, updatedBy: string, userId: number): Promise<SharedSong> {
        // Save to history
        await this.songHistoryRepository.create({
            songUrl,
            userId,
            requestedBy: updatedBy,
            requestedAt: new Date(),
        });

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

    async getSongHistory(limit: number = 50): Promise<SongHistory[]> {
        return await this.songHistoryRepository.findAll({
            order: [['requestedAt', 'DESC']],
            limit,
        });
    }
}
