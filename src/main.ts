import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { dirname, join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { engine } from 'express-handlebars';
import { WinstonLoggerService } from './logger/logger.service';
import { httpsOrigin, isSecureDeployment, publicOrigin, validateEnvironment } from './config/env';
import { SettingsService } from './settings/settings.service';
import { originCheck } from './security/origin-check.middleware';

/** Directory of an installed package, for serving its built assets. */
function packageDir(name: string): string {
  return dirname(require.resolve(`${name}/package.json`));
}

/** TRUST_PROXY: number of reverse-proxy hops in front of the app (e.g. 1 behind an ingress). */
function trustProxySetting(): number | string | undefined {
  const value = process.env.TRUST_PROXY;
  if (!value) {
    return undefined;
  }
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function bootstrap() {
  const logger = new WinstonLoggerService();
  // Fail fast on a missing or weak COOKIE_SECRET / HOST instead of running insecurely.
  validateEnvironment().forEach(warning => logger.warn(warning));

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger,
  });

  const trustProxy = trustProxySetting();
  if (trustProxy !== undefined) {
    // Needed behind a proxy so req.ip (rate limiting) and req.secure are the client's, not the proxy's.
    app.set('trust proxy', trustProxy);
  }
  app.disable('x-powered-by');

  // The letter on /kiri is an admin setting that can change at runtime, so frame-src follows it per request.
  const settingsService = app.get(SettingsService);
  const letterFrameSource = () => httpsOrigin(settingsService.letterUrl()) ?? "'none'";
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        frameSrc: [letterFrameSource],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        ...(isSecureDeployment() ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // Decryption codes can appear in URLs (?code=...): never leak them in a Referer header.
    referrerPolicy: { policy: 'no-referrer' },
    // HSTS only makes sense (and is only honoured) when served over https.
    strictTransportSecurity: isSecureDeployment() ? { maxAge: 31536000, includeSubDomains: true } : false,
  }));

  // Front-end libraries are served from installed npm packages (same origin, versions pinned by
  // yarn.lock) instead of an unpinned third-party CDN.
  const staticOptions = { index: false, fallthrough: true };
  app.useStaticAssets(join(packageDir('bootstrap'), 'dist'), { ...staticOptions, prefix: '/vendor/bootstrap' });
  app.useStaticAssets(join(packageDir('bootstrap-icons'), 'font'), { ...staticOptions, prefix: '/vendor/bootstrap-icons' });
  app.useStaticAssets(join(packageDir('toastify-js'), 'src'), { ...staticOptions, prefix: '/vendor/toastify' });
  app.useStaticAssets(join(__dirname, '..', 'public'), staticOptions);

  // Everything below the static files is dynamic and may contain personal data or codes.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const viewsDir = join(__dirname, '..', 'views');
  app.engine('hbs', engine({ extname: '.hbs', defaultLayout: false, partialsDir: join(viewsDir, 'partials') }));
  app.setBaseViewsDir(viewsDir);
  app.setViewEngine('hbs');

  app.use(cookieParser(process.env.COOKIE_SECRET));
  app.use(originCheck(publicOrigin() as string));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
