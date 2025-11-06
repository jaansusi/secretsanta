import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import * as hbs from 'hbs';
import { CustomLoggerService } from './logger/logger.service';

async function bootstrap() {

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(CustomLoggerService);
  app.useLogger(logger);

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  hbs.registerPartials(join(__dirname, '..', 'views', 'partials'));

  app.use(cookieParser(process.env.COOKIE_SECRET));

  logger.log('Starting up...');
  logger.log(`Node env: ${process.env.NODE_ENV}`);
  logger.log(`Host: ${process.env.HOST}`);

  await app.listen(process.env.PORT || 3000);
  logger.log(`Application is running on ${await app.getUrl()}`);
}
bootstrap();
