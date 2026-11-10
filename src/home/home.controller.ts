import { Body, Controller, Get, Post, Render, Req } from '@nestjs/common';
import { Request } from 'express';
import { UserService } from 'src/user/user.service';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { DossierService } from 'src/dossier/dossier.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { SettingsService } from 'src/settings/settings.service';
import { resolveAdmin } from 'src/auth/admin.guard';

@Controller()
export class HomeController {
  constructor(
    private readonly userService: UserService,
    private readonly encryptionService: EncryptionService,
    private readonly dossierService: DossierService,
    private readonly analyticsService: AnalyticsService,
    private readonly settingsService: SettingsService,
  ) { }

  @Get()
  @Render('index')
  async home(@Req() request: Request): Promise<any> {
    const year = new Date().getFullYear();
    // Lets the page start an intro clip inside the click handler, before the recipient is known.
    // Embedded in a script tag, so "<" is escaped to keep the JSON from closing it.
    const santaClips = JSON.stringify(await this.dossierService.getClipPlaylist()).replace(/</g, '\\u003c');
    if (request.cookies['santa_auth']) {
      let user = await this.userService.findOne({ where: { id: request.cookies['santa_auth'] } });
      if (user) {
        switch (user.encryptionStrategy) {
          case EncryptionStrategy.CODE:
            await this.analyticsService.track('page_view', request, { userId: user.id });
            return {
              encryptionWithCode: true,
              inputType: 'password',
              prefill: user.decryptionCode,
              loggedIn: true,
              isAdmin: user.isAdmin,
              userName: user.name,
              year,
              santaClips,
            };
        }
      }
    }
    if (request.query.code) {
      let user = await this.userService.findOne({ where: { decryptionCode: request.query.code } });
      if (user && request.res) {
        request.res.cookie('santa_auth', user.id, { maxAge: 5184000000, httpOnly: false });
        await this.analyticsService.track('link_open', request, { userId: user.id });
        return {
          encryptionWithCode: true,
          inputType: 'password',
          prefill: request.query.code,
          isAdmin: user.isAdmin,
          loggedIn: true,
          userName: user.name,
          year,
          santaClips,
        };
      }
      else {
        await this.analyticsService.track('link_invalid', request);
        return { encryptionWithCode: true, inputType: 'text', error: 'Vigane kood!', year, santaClips };
      }
    }
    await this.analyticsService.track('page_view', request);
    return { encryptionWithCode: true, inputType: 'text', year, santaClips };
  }

  @Post('result')
  async showResult(@Req() request: Request, @Body() body: any) {
    if (!body.code) {
      return { error: 'Vigane päring!' };
    }
    let user = await this.userService.findOne({ where: { decryptionCode: body.code } });
    if (!user)
      return { error: 'Seda koodi ei leitud süsteemist!' };
    if (request.res) {
      request.res.cookie('santa_auth', user.id, { maxAge: 5184000000, httpOnly: false });
    }
    const settings = this.settingsService.get();
    if (!settings.revealOpen && !(await resolveAdmin(request, this.userService))) {
      await this.analyticsService.track('reveal_closed', request, { userId: user.id });
      return { error: settings.revealClosedMessage };
    }
    // To-do: logic based on users encryption strategy
    // To-do: code decryption should use input, not the db value
    try {
      const giftingTo = await this.encryptionService.decryptGiftingTo(user);
      const recipient = await this.userService.getByName(giftingTo);
      const dossier = await this.dossierService.getRevealDossier(recipient);
      await this.analyticsService.track('reveal', request, { userId: user.id });
      return { name: user.name, strategy: user.encryptionStrategy, giftingTo, dossier };
    } catch (err) {
      console.error(err);
      await this.analyticsService.track('reveal_error', request, { userId: user.id, meta: { message: String(err.message ?? err) } });
      // Return error and timestamp for debugging purposes
      return { error: 'Viga!' + new Date().toISOString() };
    }
  }

  @Get('kiri')
  @Render('letter')
  async letter(@Req() request: Request) {
    const userId = parseInt(request.cookies?.['santa_auth'], 10);
    await this.analyticsService.track('letter_view', request, { userId: Number.isFinite(userId) ? userId : null });
    return { letterUrl: this.settingsService.letterUrl() };
  }
}
