import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Family } from 'src/family/entities/family.entity';
import { User } from 'src/user/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { AuditActor, AuditService } from 'src/audit/audit.service';
import { parseImportFile } from './import-file';
import { planImport } from './import-plan';

export interface ImportResult {
    dryRun: boolean;
    source: string | null;
    exportedAt: string | null;
    families: { created: string[]; existing: string[] };
    participants: { created: string[]; updated: string[] };
    assignments: number;
    admins: string[];
    warnings: string[];
}

@Injectable()
export class ImportService {
    constructor(
        @InjectModel(User)
        private readonly userRepository: typeof User,
        @InjectModel(Family)
        private readonly familyRepository: typeof Family,
        @InjectConnection()
        private readonly sequelize: Sequelize,
        private readonly userService: UserService,
        private readonly auditService: AuditService,
    ) { }

    /** Checks a data file and, unless `dryRun`, applies it in one transaction. Throws 400 with every problem found. */
    public async run(actor: AuditActor, content: Buffer, dryRun: boolean): Promise<ImportResult> {
        let data: unknown;
        try {
            data = JSON.parse(content.toString('utf8'));
        } catch {
            throw new BadRequestException('The file is not valid JSON.');
        }
        const { file, errors: fileErrors } = parseImportFile(data, email => this.userService.normalizeEmail(email));
        if (!file) {
            throw new BadRequestException(fileErrors);
        }

        return this.sequelize.transaction(async transaction => {
            // Read inside the transaction so the plan matches what gets written.
            const [families, users] = await Promise.all([
                this.familyRepository.findAll({ transaction }),
                this.userRepository.findAll({ transaction }),
            ]);
            const plan = planImport(
                file,
                families.map(family => ({ id: family.id, name: family.name })),
                users.map(user => ({
                    id: user.id, name: user.name, email: user.email ?? null, isAdmin: !!user.isAdmin,
                    giftingTo: user.giftingTo || null, decryptionCode: user.decryptionCode || null,
                })),
            );
            if (plan.errors.length) {
                throw new BadRequestException(plan.errors);
            }

            const result: ImportResult = {
                dryRun,
                source: file.source,
                exportedAt: file.exportedAt,
                families: {
                    created: plan.families.filter(f => f.existingId === null).map(f => f.name),
                    existing: plan.families.filter(f => f.existingId !== null).map(f => f.name),
                },
                participants: {
                    created: plan.participants.filter(p => p.existingId === null).map(p => p.row.name),
                    updated: plan.participants.filter(p => p.existingId !== null).map(p => p.previousName ? `${p.previousName} → ${p.row.name}` : p.row.name),
                },
                assignments: plan.participants.filter(p => p.row.giftingTo).length,
                admins: plan.participants.filter(p => p.isAdmin).map(p => p.row.name),
                warnings: plan.warnings,
            };
            if (dryRun) {
                return result;
            }

            const familyIds = new Map<number, number>();
            for (const family of plan.families) {
                const id = family.existingId ?? (await this.familyRepository.create({ name: family.name }, { transaction })).id;
                familyIds.set(family.fileId, id);
            }

            // Names and e-mails are unique, and a renamed participant may take a name another one gives up
            // in the same file. Park every name being written on a placeholder first, so no step collides.
            for (const action of plan.participants.filter(p => p.existingId !== null)) {
                await this.userRepository.update(
                    { name: `import-${action.existingId}-${Date.now()}`, email: null },
                    { where: { id: action.existingId! }, transaction },
                );
            }

            const userIds = new Map<number, number>();
            for (const action of plan.participants) {
                const row = action.row;
                const values = {
                    name: row.name,
                    email: row.email,
                    familyId: row.familyId !== null ? familyIds.get(row.familyId)! : null,
                    isAdmin: action.isAdmin,
                    encryptionStrategy: row.encryptionStrategy,
                    giftingTo: row.giftingTo ?? '',
                    decryptionCode: row.decryptionCode ?? '',
                    iv: '',
                    giftingToDebug: '',
                    interestingFacts: row.interestingFacts,
                };
                if (action.existingId !== null) {
                    await this.userRepository.update(values, { where: { id: action.existingId }, transaction });
                    userIds.set(row.id, action.existingId);
                } else {
                    userIds.set(row.id, (await this.userRepository.create(values, { transaction })).id);
                }
            }
            // Second pass: last year's recipient can be anyone in the file, so set it once all have ids.
            for (const action of plan.participants) {
                const target = action.row.lastYearGiftingToId;
                await this.userRepository.update(
                    { lastYearGiftingToId: target !== null ? userIds.get(target)! : null },
                    { where: { id: userIds.get(action.row.id)! }, transaction },
                );
            }

            await this.auditService.log(actor, {
                action: 'data.import',
                summary: `Imported ${plan.participants.length} participants and ${plan.families.length} families`
                    + (file.source ? ` from ${file.source}` : ''),
                details: {
                    source: file.source,
                    exportedAt: file.exportedAt,
                    familiesCreated: result.families.created.length,
                    participantsCreated: result.participants.created.length,
                    participantsUpdated: result.participants.updated.length,
                    assignments: result.assignments,
                },
            });
            return result;
        });
    }
}
