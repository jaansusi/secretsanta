import { Body, Controller, Get, Logger, Post, Render, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/entities/user.entity';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { DossierService } from 'src/dossier/dossier.service';
import { AnalyticsService } from 'src/analytics/analytics.service';
import { SettingsService } from 'src/settings/settings.service';
import { AdminAccessService } from 'src/auth/admin-access.service';
import { SessionService } from 'src/auth/session.service';
import { GroupService } from 'src/group/group.service';
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
    private readonly adminAccess: AdminAccessService,
    private readonly groupService: GroupService,
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
        return response.render('index', { encryptionWithCode: true, inputType: 'text', error: 'Vigane kood!', year, santaClips, hideHome: true });
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
        // No code until a draw has included them, so there is no mission to open yet.
        waiting: !user.decryptionCode,
        encryptionWithCode: true,
        inputType: 'password',
        prefill: user.decryptionCode,
        loggedIn: true,
        isAdmin: await this.adminAccess.canManageGroup(request, user.groupId),
        userName: user.name,
        groupName: await this.switchableGroupName(request, user),
        showLetter: !!this.settingsService.letterUrl(user.groupId),
        year,
        santaClips,
      });
    }
    await this.analyticsService.track('page_view', request);
    return response.render('index', { encryptionWithCode: true, inputType: 'text', year, santaClips, hideHome: true });
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
    const settings = this.settingsService.get(user.groupId);
    if (!settings.revealOpen && !(await this.adminAccess.canManageGroup(request, user.groupId))) {
      await this.analyticsService.track('reveal_closed', request, { userId: user.id });
      return { error: settings.revealClosedMessage };
    }
    try {
      const giftingTo = this.encryptionService.decryptGiftingTo(user);
      // Names are unique per group only: the recipient is always looked up in the Santa's own group.
      const recipient = await this.userService.getByName(user.groupId, giftingTo);
      const dossier = await this.dossierService.getRevealDossier(recipient);
      // The player's own name on the maze scoreboard: only they are told which agent is them.
      const agentName = await this.userService.agentName(user);
      await this.analyticsService.track('reveal', request, { userId: user.id });
      return { name: user.name, agentName, strategy: user.encryptionStrategy, giftingTo, dossier };
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
    const user = await this.sessionService.getUser(request);
    await this.analyticsService.track('letter_view', request, { userId: user?.id ?? null });
    // Each group has its own letter (or none); visitors who are not signed in have no group, so no letter.
    const letterUrl = user ? this.settingsService.letterUrl(user.groupId) : '';
    return {
      letterUrl,
      showLetter: !!letterUrl,
      groupName: user ? await this.switchableGroupName(request, user) : null,
    };
  }

  /** For someone signed in with Google who takes part in several groups: pick which group's mission to open. */
  @Get('grupp')
  async chooseGroup(@Req() request: Request, @Res() response: Response) {
    const memberships = await this.ownMemberships(request);
    if (memberships.length < 2) {
      return response.redirect(303, '/');
    }
    const current = this.sessionService.readUserId(request);
    const groups = await this.groupService.namesById(memberships.map(member => member.groupId));
    const currentUser = memberships.find(member => member.id === current);
    return response.render('groups', {
      showLetter: !!currentUser && !!this.settingsService.letterUrl(currentUser.groupId),
      choices: memberships.map(member => ({
        userId: member.id,
        groupName: groups.get(member.groupId) ?? '?',
        userName: member.name,
        current: member.id === current,
      })),
    });
  }

  @Post('grupp')
  async switchGroup(@Req() request: Request, @Body() body: { userId?: unknown }, @Res() response: Response) {
    const userId = typeof body?.userId === 'string' ? Number(body.userId) : body?.userId;
    // Only one of the rows that belong to the Google account this browser signed in with.
    const target = (await this.ownMemberships(request)).find(member => member.id === userId);
    if (target) {
      this.sessionService.start(response, target);
    }
    return response.redirect(303, '/');
  }

  /**
   * The name of the signed-in participant's group for the header's group switch, or null when there is nothing to
   * switch to: only people in several groups need to be told which one they are looking at.
   */
  private async switchableGroupName(request: Request, user: User): Promise<string | null> {
    if ((await this.ownMemberships(request)).length < 2) {
      return null;
    }
    return (await this.groupService.get(user.groupId))?.name ?? null;
  }

  /**
   * The participant rows of the Google account this browser last signed in with (none after a code link), in the
   * groups participants can choose: disabled groups are left out.
   */
  private async ownMemberships(request: Request): Promise<User[]> {
    const email = this.sessionService.googleIdentity(request);
    const memberships = email ? await this.userService.getAllByEmail(email) : [];
    return memberships.filter(member => this.settingsService.isGroupEnabled(member.groupId));
  }
}
