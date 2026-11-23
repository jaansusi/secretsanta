import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Family } from 'src/family/entities/family.entity';
import { User } from 'src/user/entities/user.entity';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { readIdList, readString } from './api/input';

/** Families are the "never give within" groups of the draw. Every family belongs to one group. */
@Injectable()
export class FamiliesService {
    constructor(
        @InjectModel(Family)
        private readonly familyRepository: typeof Family,
        @InjectModel(User)
        private readonly userRepository: typeof User,
        @InjectConnection()
        private readonly sequelize: Sequelize,
        private readonly auditService: AuditService,
    ) { }

    public async list(groupId: number) {
        const families = await this.familyRepository.findAll({
            where: { groupId },
            include: [{ model: User, attributes: ['id', 'name'] }],
            order: [['name', 'ASC']],
        });
        return families.map(family => ({
            id: family.id,
            name: family.name,
            members: (family.members ?? []).map(member => ({ id: member.id, name: member.name })).sort((a, b) => a.name.localeCompare(b.name)),
            createdAt: family.createdAt,
        }));
    }

    public async create(actor: AuditActor, groupId: number, body: any) {
        const name = readString(body, 'name', { required: true, max: 100 })!;
        await this.assertUniqueName(groupId, name, null);
        const family = await this.familyRepository.create({ groupId, name });
        if (body?.memberIds !== undefined) {
            await this.setMembers(actor, groupId, family.id, body, false);
        }
        await this.auditService.log(actor, { groupId, action: 'family.create', entityType: 'family', entityId: family.id, summary: `Created family ${name}` });
        return this.get(groupId, family.id);
    }

    public async rename(actor: AuditActor, groupId: number, id: number, body: any) {
        const family = await this.require(groupId, id);
        const name = readString(body, 'name', { required: true, max: 100 })!;
        if (name !== family.name) {
            await this.assertUniqueName(groupId, name, id);
            await this.familyRepository.update({ name }, { where: { id, groupId } });
            await this.auditService.log(actor, { groupId, action: 'family.update', entityType: 'family', entityId: id, summary: `Renamed family ${family.name} to ${name}` });
        }
        return this.get(groupId, id);
    }

    public async setMembers(actor: AuditActor, groupId: number, id: number, body: any, audit = true) {
        const family = await this.require(groupId, id);
        const memberIds = readIdList(body, 'memberIds');
        // Only participants of the same group can join the family.
        const found = await this.userRepository.count({ where: { id: memberIds, groupId } });
        if (found !== memberIds.length) {
            throw new BadRequestException('Some participants were not found');
        }
        await this.sequelize.transaction(async transaction => {
            await this.userRepository.update({ familyId: null }, { where: { groupId, familyId: id, id: { [Op.notIn]: memberIds.length ? memberIds : [0] } }, transaction });
            if (memberIds.length) {
                await this.userRepository.update({ familyId: id }, { where: { id: memberIds, groupId }, transaction });
            }
        });
        if (audit) {
            await this.auditService.log(actor, {
                groupId, action: 'family.members', entityType: 'family', entityId: id,
                summary: `Set ${memberIds.length} members for family ${family.name}`,
                details: { memberIds },
            });
        }
        return this.get(groupId, id);
    }

    public async remove(actor: AuditActor, groupId: number, id: number) {
        const family = await this.require(groupId, id);
        await this.sequelize.transaction(async transaction => {
            await this.userRepository.update({ familyId: null }, { where: { familyId: id }, transaction });
            await this.familyRepository.destroy({ where: { id, groupId }, transaction });
        });
        await this.auditService.log(actor, { groupId, action: 'family.delete', entityType: 'family', entityId: id, summary: `Deleted family ${family.name}` });
        return { ok: true };
    }

    private async get(groupId: number, id: number) {
        return (await this.list(groupId)).find(family => family.id === id);
    }

    /** A family of this group; one of another group is "not found", never revealed. */
    private async require(groupId: number, id: number) {
        const family = await this.familyRepository.findOne({ where: { id, groupId } });
        if (!family) {
            throw new NotFoundException('Family not found');
        }
        return family;
    }

    private async assertUniqueName(groupId: number, name: string, exceptId: number | null) {
        const all = await this.familyRepository.findAll({ where: { groupId } });
        if (all.some(family => family.id !== exceptId && family.name.toLowerCase() === name.toLowerCase())) {
            throw new BadRequestException(`There is already a family called ${name}`);
        }
    }
}
