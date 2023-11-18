import { Controller, Get, Render, Req } from '@nestjs/common';
import { HomeService } from './home.service';
import { Request } from 'express';
import { InjectModel } from '@nestjs/sequelize';
import { User } from 'src/user/entities/user.entity';

@Controller()
export class HomeController {
  constructor(
    private readonly homeService: HomeService,
    @InjectModel(User) private userRepository: typeof User,
  ) { }

  @Get()
  @Render('index')
  async home(@Req() request: Request) {
    if (request.cookies['santa_auth'])
      request.query.code = request.cookies['santa_auth'];
    if (request.query.code) {
      let user = await this.userRepository.findOne({ where: { decryptionCode: request.cookies['santa_auth'] } });
      if (user)
        return {
          inputType: 'password',
          prefill: request.query.code,
          isAdmin: user.isAdmin,
        };
    }
    return { inputType: 'text' };
  }

  @Get('showResult')
  @Render('result')
  async showResult(@Req() request: Request) {
    if (request.cookies['santa_auth']) {
      request.query.code = request.cookies['santa_auth'];
    }
    if (!request.query.code) {
      return { result: 'Vigane päring!' };
    }
    let response = await this.userRepository.findOne({ where: { decryptionCode: request.query.code } }).then(user => {
      if (!user) {
        return 'Seda koodi ei leitud süsteemist!';
      } else {
        request.res.cookie('santa_auth', user.decryptionCode, { maxAge: 5184000000, httpOnly: true });
        return user.giftingTo;
      }
    });
    return { result: response, success: true };
  }
}
