import { Injectable } from '@nestjs/common';
import { User } from '../user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { ConfigService } from '@nestjs/config';
import { CustomLoggerService } from 'src/logger/logger.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private configService: ConfigService,
    private logger: CustomLoggerService,
  ) { }

  async getUserWithGoogleLogin(req: any): Promise<User | null> {
    if (!req.user) {
      this.logger.warn('Google login attempt with no user data!');
      return null;
    }
    const adminEmail = this.userService.cleanGmailAddress(this.configService.get<string>('ADMIN_EMAIL') || '');
    const cleanedEmail = this.userService.cleanGmailAddress(req.user.email);
    const existingUser = await this.userService.getByEmail(cleanedEmail);
    if (existingUser) {
      if (cleanedEmail === adminEmail && !existingUser.isAdmin) {
        // If user is marked as admin but is not, make the user admin.
        let dto = new CreateUserDto();
        dto.isAdmin = true;
        await this.userService.updateUser(existingUser.id, dto);
      }
      return existingUser;
    }
    
    if (cleanedEmail === adminEmail) {
      // If admin user does not exist, create one.
      let newUserDto = new CreateUserDto();
      newUserDto.name = req.user.firstName + ' ' + req.user.lastName;
      newUserDto.email = cleanedEmail;
      newUserDto.isAdmin = true;
      await this.userService.createUser(newUserDto);
    }

    return await this.userService.findOne({ where: { email: cleanedEmail } }).then(user => {
      if (!user) {
        return null;
      }
      return user;
    });
  }
}