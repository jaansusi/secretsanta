import { Body, Controller, Get, Post, Render, Req } from '@nestjs/common';
import { Request } from 'express';
import { UserService } from 'src/user/user.service';
import { EncryptionService, EncryptionStrategy } from 'src/encryption/encryption.service';
import { DossierService } from 'src/dossier/dossier.service';

@Controller()
export class HomeController {
  constructor(
    private readonly userService: UserService,
    private readonly encryptionService: EncryptionService,
    private readonly dossierService: DossierService,
  ) { }

  @Get()
  @Render('index')
  async home(@Req() request: Request): Promise<any> {
    const year = new Date().getFullYear();
    if (request.cookies['santa_auth']) {
      let user = await this.userService.findOne({ where: { id: request.cookies['santa_auth'] } });
      if (user) {
        switch (user.encryptionStrategy) {
          case EncryptionStrategy.CODE:
            return {
              encryptionWithCode: true,
              inputType: 'password',
              prefill: user.decryptionCode,
              loggedIn: true,
              isAdmin: user.isAdmin,
              userName: user.name,
              year,
            };
        }
      }
    }
    if (request.query.code) {
      let user = await this.userService.findOne({ where: { decryptionCode: request.query.code } });
      if (user && request.res) {
        request.res.cookie('santa_auth', user.id, { maxAge: 5184000000, httpOnly: false });
        return {
          encryptionWithCode: true,
          inputType: 'password',
          prefill: request.query.code,
          isAdmin: user.isAdmin,
          loggedIn: true,
          userName: user.name,
          year,
        };
      }
      else
        return { encryptionWithCode: true, inputType: 'text', error: 'Vigane kood!', year };
    }
    return { encryptionWithCode: true, inputType: 'text', year };
  }

  @Post('result')
  async showResult(@Req() request: Request, @Body() body: any) {
    if (request.cookies['santa_auth']) {
      request.query.code = request.cookies['santa_auth'];
    }
    if (!body.code) {
      return { error: 'Vigane päring!' };
    }
    let user = await this.userService.findOne({ where: { decryptionCode: body.code } });
    if (!user)
      return { error: 'Seda koodi ei leitud süsteemist!' };
    if (request.res) {
      request.res.cookie('santa_auth', user.id, { maxAge: 5184000000, httpOnly: false });
    }
    // To-do: logic based on users encryption strategy
    // To-do: code decryption should use input, not the db value
    try {
      const giftingTo = await this.encryptionService.decryptGiftingTo(user);
      const recipient = await this.userService.getByName(giftingTo);
      const dossier = await this.dossierService.getRevealDossier(recipient);
      return { name: user.name, strategy: user.encryptionStrategy, giftingTo, dossier };
    } catch (err) {
      console.error(err);
      // Return error and timestamp for debugging purposes
      return { error: 'Viga!' + new Date().toISOString() };
    }
  }

  @Get('kiri')
  @Render('letter')
  async letter(@Req() request: Request) {
    return { letterUrl: process.env.GOOGLE_DOC_LETTER_LINK };
  }
}
