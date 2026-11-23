import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { fn, col, where } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Group } from './entities/group.entity';
import { User } from 'src/user/entities/user.entity';
import { Family } from 'src/family/entities/family.entity';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { SettingsService } from 'src/settings/settings.service';
import { readString } from 'src/admin/api/input';
import { normalizeEmail } from 'src/user/user.service';

/** The groups (tenants). Listing them is for everyone who needs a name; changing them is for the super admin. */
@Injectable()
export class GroupService {
    constructor(
        @InjectModel(Group) private readonly groupRepository: typeof Group,
        @InjectModel(User) private readonly userRepository: typeof User,
        @InjectModel(Family) private readonly familyRepository: typeof Family,
        @InjectConnection() private readonly sequelize: Sequelize,
        private readonly auditService: AuditService,
        private readonly settingsService: SettingsService,
    ) { }

    public async get(id: number): Promise<Group | null> {
        return this.groupRepository.findByPk(id);
    }

    public async namesById(ids: number[]): Promise<Map<number, string>> {
        if (!ids.length) return new Map();
        const groups = await this.groupRepository.findAll({ where: { id: [...new Set(ids)] }, attributes: ['id', 'name'] });
        return new Map(groups.map(group => [group.id, group.name]));
    }

    /** Every group with its size and admins, for the super admin's Groups page. */
    public async list() {
        const [groups, users] = await Promise.all([
            this.groupRepository.findAll({ order: [['name', 'ASC'], ['id', 'ASC']] }),
            this.userRepository.findAll({ attributes: ['id', 'name', 'email', 'groupId', 'isAdmin', 'giftingTo'] }),
        ]);
        return groups.map(group => {
            const members = users.filter(user => user.groupId === group.id);
            return {
                id: group.id,
                name: group.name,
                participants: members.length,
                enabled: this.settingsService.isGroupEnabled(group.id),
                drawn: members.some(user => !!user.giftingTo),
                admins: members.filter(user => user.isAdmin).map(user => ({ id: user.id, name: user.name, email: user.email })),
                createdAt: group.createdAt,
            };
        });
    }

    /** Creates a group, optionally with its first admin (a participant marked as admin). */
    public async create(actor: AuditActor, body: any) {
        const name = readString(body, 'name', { required: true, max: 100 })!;
        await this.assertUniqueName(name, null);
        const adminName = readString(body, 'adminName', { max: 100 }) || '';
        const rawEmail = readString(body, 'adminEmail', { max: 200 }) || '';
        const adminEmail = rawEmail ? normalizeEmail(rawEmail) : '';
        if ((adminName || adminEmail) && !(adminName && adminEmail)) {
            throw new BadRequestException('Give both the name and the e-mail of the first admin, or neither');
        }
        if (adminEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
            throw new BadRequestException('adminEmail does not look like an e-mail address');
        }
        const group = await this.sequelize.transaction(async transaction => {
            const created = await this.groupRepository.create({ name, settings: {} }, { transaction });
            if (adminEmail) {
                await this.userRepository.create({ groupId: created.id, name: adminName, email: adminEmail, isAdmin: true }, { transaction });
            }
            return created;
        });
        await this.settingsService.reload();
        await this.auditService.log(actor, {
            groupId: group.id, action: 'group.create', entityType: 'group', entityId: group.id,
            summary: `Created group ${name}` + (adminEmail ? ` with admin ${adminName}` : ''),
        });
        return (await this.list()).find(item => item.id === group.id);
    }

    public async rename(actor: AuditActor, id: number, body: any) {
        const group = await this.require(id);
        const name = readString(body, 'name', { required: true, max: 100 })!;
        if (name !== group.name) {
            await this.assertUniqueName(name, id);
            await this.groupRepository.update({ name }, { where: { id } });
            await this.auditService.log(actor, {
                groupId: id, action: 'group.update', entityType: 'group', entityId: id,
                summary: `Renamed group ${group.name} to ${name}`,
            });
        }
        return (await this.list()).find(item => item.id === id);
    }

    /** Only an empty group can be deleted, so nobody's draw, dossier or games disappear by accident. */
    public async remove(actor: AuditActor, id: number) {
        const group = await this.require(id);
        if (await this.userRepository.count({ where: { groupId: id } })) {
            throw new BadRequestException('Remove the participants of this group first.');
        }
        if (await this.groupRepository.count() <= 1) {
            throw new BadRequestException('The last group cannot be deleted.');
        }
        await this.sequelize.transaction(async transaction => {
            await this.familyRepository.destroy({ where: { groupId: id }, transaction });
            await this.groupRepository.destroy({ where: { id }, transaction });
        });
        await this.settingsService.reload();
        await this.auditService.log(actor, {
            groupId: null, action: 'group.delete', entityType: 'group', entityId: id,
            summary: `Deleted group ${group.name}`,
        });
        return { ok: true };
    }

    public async require(id: number): Promise<Group> {
        const group = await this.groupRepository.findByPk(id);
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        return group;
    }

    private async assertUniqueName(name: string, exceptId: number | null) {
        const clash = await this.groupRepository.findOne({ where: where(fn('lower', col('name')), name.toLowerCase()) });
        if (clash && clash.id !== exceptId) {
            throw new BadRequestException(`There is already a group called ${name}`);
        }
    }
}
