import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, where } from 'sequelize';
import { Request } from 'express';
import { User } from 'src/user/entities/user.entity';
import { Group } from 'src/group/entities/group.entity';
import { normalizeEmail, superAdminEmail } from 'src/user/user.service';
import { AdminContext, adminSessionEmail, selectedAdminGroupId } from './admin-session';

/**
 * Works out what the signed-in admin may manage, from the verified e-mail in the admin cookie:
 * - the super admin (ADMIN_EMAIL) manages every group;
 * - anyone else manages the groups in which a participant with their e-mail is marked as admin.
 * Re-evaluated on every request, so removing someone's admin flag takes effect immediately.
 */
@Injectable()
export class AdminAccessService {
    constructor(
        @InjectModel(User) private readonly users: typeof User,
        @InjectModel(Group) private readonly groups: typeof Group,
    ) { }

    public async resolve(request: Request): Promise<AdminContext | null> {
        const sessionEmail = adminSessionEmail(request);
        if (!sessionEmail) {
            return null;
        }
        const email = normalizeEmail(sessionEmail);
        const isSuperAdmin = email === superAdminEmail();
        const memberships = await this.users.findAll({
            where: where(fn('lower', col('email')), email),
            order: [['groupId', 'ASC'], ['id', 'ASC']],
        });
        const groups = isSuperAdmin
            ? await this.groups.findAll({ order: [['name', 'ASC'], ['id', 'ASC']] })
            : await this.groups.findAll({
                where: { id: [...new Set(memberships.filter(user => user.isAdmin).map(user => user.groupId))] },
                order: [['name', 'ASC'], ['id', 'ASC']],
            });
        if (groups.length === 0) {
            return null;
        }
        const selected = selectedAdminGroupId(request);
        const group = groups.find(candidate => candidate.id === selected)
            ?? groups.find(candidate => memberships.some(user => user.groupId === candidate.id && user.isAdmin))
            ?? groups[0];
        const actor = memberships.find(user => user.groupId === group.id) ?? memberships[0];
        if (!actor) {
            // A super admin who is not a participant anywhere (cannot happen through sign-in, which creates one).
            return null;
        }
        return { email, isSuperAdmin, group, groups, actor };
    }

    /** Whether the signed-in admin (if any) may manage the given group. */
    public async canManageGroup(request: Request, groupId: number): Promise<boolean> {
        const context = await this.resolve(request);
        return !!context && context.groups.some(group => group.id === groupId);
    }
}
