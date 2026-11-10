import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import hbs from 'hbs';
import { WinstonLoggerService } from './logger/logger.service';


async function bootstrap() {
  const logger = new WinstonLoggerService();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger,
  });

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  hbs.registerPartials(join(__dirname, '..', 'views', 'partials'));

  if (!process.env.COOKIE_SECRET) {
    // The admin session is a signed cookie; without a secret nobody can sign in to /admin.
    logger.warn('COOKIE_SECRET is not set: admin sign-in will not work.');
  }
  app.use(cookieParser(process.env.COOKIE_SECRET));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
