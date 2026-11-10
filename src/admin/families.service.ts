import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Family } from 'src/family/entities/family.entity';
import { User } from 'src/user/entities/user.entity';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { readIdList, readString } from './api/input';

/** Families are the "never give within" groups of the draw. */
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

    public async list() {
        const families = await this.familyRepository.findAll({
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

    public async create(actor: AuditActor, body: any) {
        const name = readString(body, 'name', { required: true, max: 100 })!;
        await this.assertUniqueName(name, null);
        const family = await this.familyRepository.create({ name });
        if (body?.memberIds !== undefined) {
            await this.setMembers(actor, family.id, body, false);
        }
        await this.auditService.log(actor, { action: 'family.create', entityType: 'family', entityId: family.id, summary: `Created family ${name}` });
        return this.get(family.id);
    }

    public async rename(actor: AuditActor, id: number, body: any) {
        const family = await this.require(id);
        const name = readString(body, 'name', { required: true, max: 100 })!;
        if (name !== family.name) {
            await this.assertUniqueName(name, id);
            await this.familyRepository.update({ name }, { where: { id } });
            await this.auditService.log(actor, { action: 'family.update', entityType: 'family', entityId: id, summary: `Renamed family ${family.name} to ${name}` });
        }
        return this.get(id);
    }

    public async setMembers(actor: AuditActor, id: number, body: any, audit = true) {
        const family = await this.require(id);
        const memberIds = readIdList(body, 'memberIds');
        const found = await this.userRepository.count({ where: { id: memberIds } });
        if (found !== memberIds.length) {
            throw new BadRequestException('Some participants were not found');
        }
        await this.sequelize.transaction(async transaction => {
            await this.userRepository.update({ familyId: null }, { where: { familyId: id, id: { [Op.notIn]: memberIds.length ? memberIds : [0] } }, transaction });
            if (memberIds.length) {
                await this.userRepository.update({ familyId: id }, { where: { id: memberIds }, transaction });
            }
        });
        if (audit) {
            await this.auditService.log(actor, {
                action: 'family.members', entityType: 'family', entityId: id,
                summary: `Set ${memberIds.length} members for family ${family.name}`,
                details: { memberIds },
            });
        }
        return this.get(id);
    }

    public async remove(actor: AuditActor, id: number) {
        const family = await this.require(id);
        await this.sequelize.transaction(async transaction => {
            await this.userRepository.update({ familyId: null }, { where: { familyId: id }, transaction });
            await this.familyRepository.destroy({ where: { id }, transaction });
        });
        await this.auditService.log(actor, { action: 'family.delete', entityType: 'family', entityId: id, summary: `Deleted family ${family.name}` });
        return { ok: true };
    }

    private async get(id: number) {
        return (await this.list()).find(family => family.id === id);
    }

    private async require(id: number) {
        const family = await this.familyRepository.findByPk(id);
        if (!family) {
            throw new NotFoundException('Family not found');
        }
        return family;
    }

    private async assertUniqueName(name: string, exceptId: number | null) {
        const all = await this.familyRepository.findAll();
        if (all.some(family => family.id !== exceptId && family.name.toLowerCase() === name.toLowerCase())) {
            throw new BadRequestException(`There is already a family called ${name}`);
        }
    }
}
