import { Body, Controller, Get, Logger, Post, Render, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { UserService } from 'src/user/user.service';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { DossierService } from 'src/dossier/dossier.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { SettingsService } from 'src/settings/settings.service';
import { resolveAdmin } from 'src/auth/admin.guard';
import { SessionService } from 'src/auth/session.service';
import { CODE_CHECK_THROTTLE } from 'src/security/throttle';

@Controller()
export class HomeController {
  constructor(
    private readonly userService: UserService,
    private readonly encryptionService: EncryptionService,
    private readonly dossierService: DossierService,
    private readonly analyticsService: AnalyticsService,
    private readonly settingsService: SettingsService,
    private readonly sessionService: SessionService,
    private readonly logger: Logger,
  ) { }

  @Get()
  @Throttle(CODE_CHECK_THROTTLE)
  async home(@Req() request: Request, @Res() response: Response) {
    const year = new Date().getFullYear();
    // Lets the page start an intro clip inside the click handler, before the recipient is known.
    // Rendered into a data-* attribute (escaped by Handlebars) and parsed by index.js: no inline script.
    const santaClips = JSON.stringify(await this.dossierService.getClipPlaylist());

    if (request.query.code !== undefined) {
      const user = await this.userService.getByDecryptionCode(request.query.code);
      if (!user) {
        await this.analyticsService.track('link_invalid', request);
        return response.render('index', { encryptionWithCode: true, inputType: 'text', error: 'Vigane kood!', year, santaClips });
      }
      await this.analyticsService.track('link_open', request, { userId: user.id });
      // Trade the code in the link for a session, then drop it from the address bar,
      // browser history and any Referer header.
      this.sessionService.start(response, user);
      return response.redirect(303, '/');
    }

    const user = await this.sessionService.getUser(request);
    if (user && user.encryptionStrategy === EncryptionStrategy.CODE) {
      await this.analyticsService.track('page_view', request, { userId: user.id });
      return response.render('index', {
        encryptionWithCode: true,
        inputType: 'password',
        prefill: user.decryptionCode,
        loggedIn: true,
        isAdmin: user.isAdmin,
        userName: user.name,
        year,
        santaClips,
      });
    }
    await this.analyticsService.track('page_view', request);
    return response.render('index', { encryptionWithCode: true, inputType: 'text', year, santaClips });
  }

  @Post('result')
  @Throttle(CODE_CHECK_THROTTLE)
  async showResult(@Req() request: Request, @Body() body: { code?: unknown }, @Res({ passthrough: true }) response: Response) {
    if (typeof body?.code !== 'string' || body.code.trim() === '') {
      return { error: 'Vigane päring!' };
    }
    const user = await this.userService.getByDecryptionCode(body.code);
    if (!user) {
      return { error: 'Seda koodi ei leitud süsteemist!' };
    }
    this.sessionService.start(response, user);
    const settings = this.settingsService.get();
    if (!settings.revealOpen && !(await resolveAdmin(request, this.userService))) {
      await this.analyticsService.track('reveal_closed', request, { userId: user.id });
      return { error: settings.revealClosedMessage };
    }
    try {
      const giftingTo = this.encryptionService.decryptGiftingTo(user);
      const recipient = await this.userService.getByName(giftingTo);
      const dossier = await this.dossierService.getRevealDossier(recipient);
      await this.analyticsService.track('reveal', request, { userId: user.id });
      return { name: user.name, strategy: user.encryptionStrategy, giftingTo, dossier };
    } catch (err) {
      this.logger.error(`Reveal failed for user ${user.id}: ${err.message}`);
      await this.analyticsService.track('reveal_error', request, { userId: user.id, meta: { message: String(err.message ?? err) } });
      // Return error and timestamp for debugging purposes
      return { error: 'Viga!' + new Date().toISOString() };
    }
  }

  @Get('kiri')
  @Render('letter')
  async letter(@Req() request: Request) {
    await this.analyticsService.track('letter_view', request, { userId: this.sessionService.readUserId(request) });
    return { letterUrl: this.settingsService.letterUrl() };
  }
}
