import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SongService } from './song.service';
import { UserService } from 'src/user/user.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class SongGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private onlineUsers: Map<string, { userId: number; userName: string }> = new Map();

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

    @SubscribeMessage('userConnected')
    async handleUserConnected(
        @MessageBody() data: { userId: number; userName: string },
        @ConnectedSocket() client: Socket,
    ) {
        this.onlineUsers.set(client.id, { userId: data.userId, userName: data.userName });
        this.broadcastOnlineUsers();
    }

    handleConnection(client: Socket) {
        console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Client disconnected: ${client.id}`);
        this.onlineUsers.delete(client.id);
        this.broadcastOnlineUsers();
    }

    private broadcastOnlineUsers() {
        const users = Array.from(this.onlineUsers.values());
        const uniqueUsers = Array.from(
            new Map(users.map(user => [user.userId, user])).values()
        );
        this.server.emit('onlineUsers', uniqueUsers);
    }
}
