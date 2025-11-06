import { Injectable } from '@nestjs/common';
import OpenAI from "openai";
import { ChatCompletionMessage, ChatCompletionMessageParam } from 'openai/resources';
import { ChatMessageDto } from './dtos/chat-message.dto';
import { InjectModel } from '@nestjs/sequelize';
import { ChatEntry } from './entities/chat-entry.entity';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatGPTService {
    private openai: OpenAI;

    constructor(
        @InjectModel(ChatEntry)
        private readonly chatEntryRepository: typeof ChatEntry,
        private readonly userService: UserService,
        private readonly configService: ConfigService
    ) {
        this.openai = new OpenAI();
    }

    public async generateResponse(message: ChatMessageDto, user: User): Promise<ChatCompletionMessage> {
        let chatEntry = {
            userId: user.id,
            sessionId: message.sessionId,
            content: message.content
        };
        await this.chatEntryRepository.upsert(chatEntry);
        let messages = await this.chatEntryRepository.findAll({ where: { sessionId: message.sessionId } });

        let systemMessage: ChatCompletionMessageParam = {
            role: "system", content:
                `
Sa oled jõuluvana ja suhtled kasutajatega jõululoosi veebilehel läbi vestlusakna. Sinu peamine eesmärk on kaasata kasutajaid lõbusatesse ja toredatesse vestlustesse, levitades jõulurõõmu.
Reeglid:
1. Kui kasutaja palub muusika kinni panna siis ütle täpselt: "Panin muusika pausile!".
2. Kui kasutaja palub muusikat edasi mängida siis ütle täpselt: "Panin muusika mängima!".
3. Kui kasutaja palub muusika valjemaks keerata siis ütle täpselt: "Keerasin muusika valjemaks!".
4. Kui kasutaja palub muusika vaiksemaks keerata siis ütle täpselt: "Keerasin muusika vaiksemaks!".
5. Räägi alati eesti keeles.
6. Püsi alati karakteris, vasta nagu jõuluvana vastaks ning ära maini, et oled tehisintellekt.
7. Vasta 1-4 lausega.
8. Ole positiivne ja sõbralik.

Veel sinu kohta:
* Sina saad asju teada päkapikkudelt.
* Sulle meeldib kui inimesed teevad üksteistele pakke, see teeb sinu elu kergemaks.
* Sul on käes kindad ja sa lendad parasjagu saaniga ning vestled kasutajaga telefonis, seetõttu teed ka kirjavigu

Kasutaja nimi on ${user.name}.
`
        };
        let messageHistory = messages.map(m => ({ role: m.userId ? "user" : "assistant", content: m.content } as ChatCompletionMessageParam));

        const response = await this.openai.chat.completions.create({
            model: this.configService.get<string>('OPENAI_MODEL') || 'gpt-5-mini',
            messages: [
                systemMessage,
                ...messageHistory
            ]
        });
        const responseMessage = response.choices[0].message;
        await this.chatEntryRepository.upsert({ userId: null, sessionId: message.sessionId, content: responseMessage.content });
        return responseMessage;
    }
}