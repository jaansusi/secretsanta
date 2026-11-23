import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../user/entities/user.entity';
import { UserService, superAdminEmail } from 'src/user/user.service';
import { Group } from 'src/group/entities/group.entity';
import { GoogleUser } from './google.strategy';

export interface GoogleSignIn {
  /** The verified address, normalized. */
  email: string;
  /** The person's participant rows, one per group, oldest group first. Never empty. */
  memberships: User[];
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    @InjectModel(Group) private readonly groups: typeof Group,
    private readonly logger: Logger,
  ) { }

  /**
   * Maps a verified Google identity to the participants with that e-mail (one per group). Unknown emails are
   * rejected, except ADMIN_EMAIL, which is created as an admin participant of the first group.
   */
  async signInWithGoogle(googleUser: GoogleUser | undefined): Promise<GoogleSignIn | null> {
    if (!googleUser?.email) {
      this.logger.warn('Google login attempt with no user data!');
      return null;
    }
    const email = this.userService.normalizeEmail(googleUser.email);
    const isSuperAdmin = email === superAdminEmail();

    const memberships = await this.userService.getAllByEmail(email);
    if (memberships.length) {
      return { email, memberships, isSuperAdmin };
    }

    if (isSuperAdmin) {
      // There is always at least one group (see migrateToGroups).
      const group = await this.groups.findOne({ order: [['id', 'ASC']] });
      if (group) {
        this.logger.log(`Creating the administrator account from ADMIN_EMAIL in group #${group.id}.`);
        await this.userService.createUser(group.id, {
          name: `${googleUser.firstName} ${googleUser.lastName}`.trim() || email,
          email,
          isAdmin: true,
        });
        return { email, memberships: await this.userService.getAllByEmail(email), isSuperAdmin };
      }
    }

    this.logger.warn('Google login for an email that is not a participant was rejected.');
    return null;
  }
}
