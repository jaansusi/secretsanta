import { Injectable, LoggerService } from '@nestjs/common';

@Injectable()
export class CustomLoggerService implements LoggerService {
  private serviceName = 'saaris-api';

  private formatMessage(level: string, message: any, context?: string) {
    const logObject = {
      level,
      message: typeof message === 'object' ? JSON.stringify(message) : message,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      ...(context && { context }),
    };
    return JSON.stringify(logObject);
  }

  log(message: any, context?: string) {
    console.log(this.formatMessage('info', message, context));
  }

  error(message: any, trace?: string, context?: string) {
    const logObject = {
      level: 'error',
      message: typeof message === 'object' ? JSON.stringify(message) : message,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      ...(context && { context }),
      ...(trace && { trace }),
    };
    console.error(JSON.stringify(logObject));
  }

  warn(message: any, context?: string) {
    console.warn(this.formatMessage('warn', message, context));
  }

  debug(message: any, context?: string) {
    console.debug(this.formatMessage('debug', message, context));
  }

  verbose(message: any, context?: string) {
    console.log(this.formatMessage('verbose', message, context));
  }
}
