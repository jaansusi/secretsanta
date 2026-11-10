import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Family } from 'src/family/entities/family.entity';
import { AnalyticsService, REPORT_TIME_ZONE } from 'src/analytics/analytics.service';
import { AuditService } from 'src/audit/audit.service';
import { SettingsService } from 'src/settings/settings.service';
import { DrawService } from './draw.service';
import { ParticipantsService } from './participants.service';

type ItemStatus = 'done' | 'todo' | 'warn' | 'info';

/** The dashboard: is everything ready, and how far along is this season. */
@Injectable()
export class OverviewService {
    constructor(
        @InjectModel(Family)
        private readonly familyRepository: typeof Family,
        private readonly participantsService: ParticipantsService,
        private readonly drawService: DrawService,
        private readonly analyticsService: AnalyticsService,
        private readonly auditService: AuditService,
        private readonly settingsService: SettingsService,
    ) { }

    public async overview() {
        const to = new Date();
        const from = new Date(to.getTime() - 14 * 24 * 60 * 60 * 1000);
        const [participants, families, draw, constraints, audit, events, report] = await Promise.all([
            this.participantsService.list(),
            this.familyRepository.count(),
            this.drawService.status(),
            this.drawService.constraints(),
            this.auditService.list({ limit: 8, offset: 0 }),
            this.analyticsService.recentEvents({ limit: 8, offset: 0 }),
            this.analyticsService.report({ from, to, excludeAdmins: false }),
        ]);
        const settings = this.settingsService.get();
        const total = participants.length;
        const count = (predicate: (p: typeof participants[number]) => boolean) => participants.filter(predicate).length;

        const content = {
            codename: count(p => !!p.dossier.codename),
            brief: count(p => p.dossier.hasBrief),
            photo: count(p => p.dossier.hasPhoto),
            facts: count(p => p.factsCount > 0),
            nameClips: count(p => p.nameClips > 0 || p.dossier.hasAudio),
        };
        const drawn = draw.state !== 'not_drawn';
        const revealed = participants.filter(p => drawn && p.activity?.firstReveal);
        const withoutEmail = count(p => !p.email);
        const withoutFamily = count(p => !p.familyId);
        const dossierComplete = count(p => !!p.dossier.codename && p.dossier.hasBrief && p.dossier.hasPhoto);

        const checklist: { key: string; label: string; status: ItemStatus; detail: string; href: string }[] = [
            {
                key: 'participants', label: 'Add participants', href: '/admin/participants',
                status: total >= 3 ? 'done' : 'todo',
                detail: `${total} participant${total === 1 ? '' : 's'}`,
            },
            {
                key: 'emails', label: 'Everyone has an e-mail for Google sign-in', href: '/admin/participants?filter=no-email',
                status: total > 0 && withoutEmail === 0 ? 'done' : 'warn',
                detail: withoutEmail ? `${withoutEmail} without e-mail` : 'All set',
            },
            {
                key: 'families', label: 'Group participants into families', href: '/admin/families',
                status: families > 0 ? (withoutFamily ? 'info' : 'done') : 'todo',
                detail: families ? `${families} families, ${withoutFamily} participant${withoutFamily === 1 ? '' : 's'} without one` : 'No families yet',
            },
            {
                key: 'content', label: 'Fill in dossiers', href: '/admin/content',
                status: total > 0 && dossierComplete === total ? 'done' : 'todo',
                detail: `${dossierComplete} of ${total} have codename, brief and photo`,
            },
            {
                key: 'audio', label: "Generate Santa's name clips", href: '/admin/audio',
                status: total > 0 && content.nameClips === total ? 'done' : 'warn',
                detail: `${content.nameClips} of ${total} have a clip`,
            },
            {
                key: 'draw', label: 'Run the draw', href: '/admin/draw',
                status: draw.state === 'valid' ? 'done' : draw.state === 'invalid' || !constraints.feasible ? 'warn' : 'todo',
                detail: draw.state === 'valid' ? 'All checks pass'
                    : draw.state === 'invalid' ? 'Some checks fail'
                        : constraints.feasible ? 'Ready to draw' : 'No valid draw possible with the current rules',
            },
            {
                key: 'links', label: 'Send everyone their personal link', href: '/admin/draw#links',
                status: drawn ? 'info' : 'todo',
                detail: drawn ? 'Links change on every draw' : 'Available after the draw',
            },
            {
                key: 'reveal', label: 'Open missions to participants', href: '/admin/settings',
                status: settings.revealOpen ? 'done' : 'todo',
                detail: settings.revealOpen ? 'Open' : 'Closed',
            },
            {
                key: 'opened', label: 'Everyone has opened their mission', href: '/admin/analytics',
                status: drawn && total > 0 && revealed.length === total ? 'done' : 'info',
                detail: drawn ? `${revealed.length} of ${total}` : 'After the draw',
            },
        ];

        return {
            counts: { participants: total, families, withoutEmail, withoutFamily, admins: count(p => p.isAdmin) },
            draw: { state: draw.state, assigned: draw.assigned, lastRun: draw.lastRun, feasible: constraints.feasible, warnings: constraints.warnings },
            reveal: {
                revealed: revealed.length,
                heardSanta: count(p => drawn && !!p.activity?.briefingComplete),
                total,
                waiting: drawn ? participants.filter(p => !p.activity?.firstReveal).map(p => ({ id: p.id, name: p.name, lastSeen: p.activity?.lastSeen ?? null })) : [],
            },
            content: { ...content, complete: dossierComplete, total },
            settings: {
                revealOpen: settings.revealOpen,
                exchangeDate: settings.exchangeDate,
                giftBudget: settings.giftBudget,
                adminNotes: settings.adminNotes,
                letterUrlSet: !!this.settingsService.letterUrl(),
            },
            timeZone: REPORT_TIME_ZONE,
            daily: report.daily,
            checklist,
            recentAudit: audit.items,
            recentEvents: events.items,
        };
    }
}
