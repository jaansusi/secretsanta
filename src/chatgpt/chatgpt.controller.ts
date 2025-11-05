import { Controller, Post, Body, Req } from '@nestjs/common';
import { ChatGPTService } from './chatgpt.service';
import { ChatCompletionMessage } from 'openai/resources';
import { ChatResponseDto } from './dtos/chat-response.dto';
import { ChatMessageDto } from './dtos/chat-message.dto';
import { Request } from 'express';
import { UserService } from 'src/user/user.service';

@Controller('messages')
export class ChatGPTController {
    constructor(
        private readonly chatGPTService: ChatGPTService,
        private readonly userService: UserService
    ) { }

    @Post('send')
    public async generateResponse(@Req() request: Request, @Body() prompt: ChatMessageDto): Promise<ChatResponseDto> {
        let dto = new ChatResponseDto();
        if (request.cookies['santa_auth']) {
            let user = await this.userService.findOne({ where: { id: request.cookies['santa_auth'] } });
            if (!user) {
                throw new Error('Invalid authentication');
            }

            let response = await this.chatGPTService
                .generateResponse(prompt, user)
                .then((msg: ChatCompletionMessage) => msg.content);

            if (!response) {
                throw new Error('No response from ChatGPT');
            }
            dto.content = response;
        }
        return dto;
    }
}