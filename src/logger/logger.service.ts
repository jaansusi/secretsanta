import { LoggerService } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export class WinstonLoggerService implements LoggerService {
    private readonly logger;

    constructor() {
        this.logger = WinstonModule.createLogger({
            transports: [
                new (winston.transports.Console)({
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.printf(({ timestamp, level, message }: any) => {
                            return JSON.stringify({ timestamp, level, message });
                        }),
                    ),
                }),
            ],
            level: 'debug',
        });
    }

    log(message: string) {
        this.logger.log(message);
    }
    error(message: string, trace: string) {
        this.logger.error(message, trace);
    }
    warn(message: string) {
        this.logger.warn(message);
    }
    debug(message: string) {
        this.logger.debug ? this.logger.debug(message) : this.logger.log(message);
    }
}