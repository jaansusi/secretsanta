import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SongService } from './song.service';
import { UserService } from 'src/user/user.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class SongGateway {
    @WebSocketServer()
    server: Server;

    constructor(
        private readonly songService: SongService,
        private readonly userService: UserService,
    ) {}

    @SubscribeMessage('getCurrentSong')
    async handleGetCurrentSong(@ConnectedSocket() client: Socket) {
        const song = await this.songService.getCurrentSong();
        client.emit('getCurrentSong', { songUrl: song?.songUrl, updatedBy: song?.updatedBy });
    }

    @SubscribeMessage('updateSong')
    async handleUpdateSong(
        @MessageBody() data: { songUrl: string; userId: number },
        @ConnectedSocket() client: Socket,
    ) {
        const user = await this.userService.getById(data.userId);
        if (!user) {
            return { success: false, error: 'User not found' };
        }

        const song = await this.songService.updateSong(data.songUrl, user.name, data.userId);
        
        // Broadcast to all connected clients
        this.server.emit('songUpdated', {
            songUrl: song.songUrl,
            updatedBy: song.updatedBy,
        });

        return { success: true };
    }
}
