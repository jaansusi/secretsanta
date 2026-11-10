import { Injectable, Logger } from '@nestjs/common';
import { User } from '../user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { ConfigService } from '@nestjs/config';
import { GoogleUser } from './google.strategy';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private configService: ConfigService,
    private readonly logger: Logger,
  ) { }

  /**
   * Maps a verified Google identity to an existing participant. Unknown emails are rejected,
   * except ADMIN_EMAIL, which is created (or promoted) as the administrator.
   */
  async getUserWithGoogleLogin(googleUser: GoogleUser | undefined): Promise<User | null> {
    if (!googleUser?.email) {
      this.logger.warn('Google login attempt with no user data!');
      return null;
    }
    const configuredAdmin = this.configService.get<string>('ADMIN_EMAIL') || '';
    const adminEmail = configuredAdmin ? this.userService.normalizeEmail(configuredAdmin) : null;
    const email = this.userService.normalizeEmail(googleUser.email);
    const isAdminEmail = adminEmail !== null && email === adminEmail;

    const existingUser = await this.userService.getByEmail(email);
    if (existingUser) {
      if (isAdminEmail && !existingUser.isAdmin) {
        await this.userService.setAdmin(existingUser.id, true);
        existingUser.isAdmin = true;
      }
      return existingUser;
    }

    if (isAdminEmail) {
      this.logger.log('Creating the administrator account from ADMIN_EMAIL.');
      await this.userService.createUser({
        name: `${googleUser.firstName} ${googleUser.lastName}`.trim() || email,
        email,
        isAdmin: true,
      });
      return this.userService.getByEmail(email);
    }

    this.logger.warn('Google login for an email that is not a participant was rejected.');
    return null;
  }
}
