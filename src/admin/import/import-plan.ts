import { ImportFile, ImportParticipant } from './import-file';

export interface ExistingFamily {
    id: number;
    name: string;
}

export interface ExistingUser {
    id: number;
    name: string;
    email: string | null;
    isAdmin: boolean;
    giftingTo: string | null;
    decryptionCode: string | null;
}

export interface FamilyAction {
    fileId: number;
    name: string;
    /** Database id of the family with the same name, or null to create it. */
    existingId: number | null;
}

export interface ParticipantAction {
    row: ImportParticipant;
    /** Database id of the participant it updates, or null to create one. */
    existingId: number | null;
    /** Name in the database before the import, when it changes. */
    previousName: string | null;
    /** Admin access after the import: an import never removes it. */
    isAdmin: boolean;
}

export interface ImportPlan {
    families: FamilyAction[];
    participants: ParticipantAction[];
    /** Participants already in the database that the file does not mention. They are left as they are. */
    untouched: ExistingUser[];
    errors: string[];
    warnings: string[];
}

/**
 * Decides what an import does, without touching the database. The import merges:
 * - a family matches an existing one by name (case-insensitive), otherwise it is created;
 * - a participant matches by e-mail, otherwise by name, and then takes every field from the file
 *   (dossiers, clips and analytics of that participant stay); otherwise it is created;
 * - nothing that the file does not mention is changed or deleted.
 * Re-importing the same file therefore changes nothing the second time.
 */
export function planImport(file: ImportFile, existingFamilies: ExistingFamily[], existingUsers: ExistingUser[]): ImportPlan {
    const errors: string[] = [];
    const warnings: string[] = [];

    const familiesByName = new Map(existingFamilies.map(family => [family.name.toLowerCase(), family]));
    const families: FamilyAction[] = file.families.map(family => ({
        fileId: family.id,
        name: family.name,
        existingId: familiesByName.get(family.name.toLowerCase())?.id ?? null,
    }));

    const byEmail = new Map(existingUsers.filter(user => user.email).map(user => [user.email!.toLowerCase(), user]));
    const byName = new Map(existingUsers.map(user => [user.name.toLowerCase(), user]));
    const claimedBy = new Map<number, string>();
    const participants: ParticipantAction[] = [];

    for (const row of file.participants) {
        const emailMatch = row.email ? byEmail.get(row.email.toLowerCase()) : undefined;
        const nameMatch = byName.get(row.name.toLowerCase());
        if (emailMatch && nameMatch && emailMatch.id !== nameMatch.id) {
            errors.push(`${row.name}: the e-mail ${row.email} belongs to ${emailMatch.name}, but the name belongs to another participant.`);
            continue;
        }
        const match = emailMatch ?? nameMatch ?? null;
        if (match && !emailMatch && row.email && match.email && match.email.toLowerCase() !== row.email.toLowerCase()) {
            warnings.push(`${row.name}: the e-mail changes from ${match.email} to ${row.email}.`);
        }
        if (match) {
            const other = claimedBy.get(match.id);
            if (other) {
                errors.push(`${row.name} and ${other} in the file both match the participant ${match.name}.`);
                continue;
            }
            claimedBy.set(match.id, row.name);
        }
        participants.push({
            row,
            existingId: match?.id ?? null,
            previousName: match && match.name !== row.name ? match.name : null,
            isAdmin: row.isAdmin || !!match?.isAdmin,
        });
    }

    const untouched = existingUsers.filter(user => !claimedBy.has(user.id));
    const untouchedCodes = new Set(untouched.flatMap(user => user.decryptionCode ? [user.decryptionCode] : []));
    for (const action of participants) {
        if (action.row.decryptionCode && untouchedCodes.has(action.row.decryptionCode)) {
            errors.push(`${action.row.name}: the decryption code is already used by a participant who is not in the file.`);
        }
    }

    if (untouched.length) {
        warnings.push(`${untouched.length} participant(s) already here are not in the file and stay as they are: ${untouched.map(user => user.name).join(', ')}.`);
        const drawnHere = untouched.filter(user => user.giftingTo);
        if (drawnHere.length && file.participants.some(row => row.giftingTo)) {
            warnings.push('The file brings a draw, and some participants not in the file have assignments from another draw. Check the draw page afterwards.');
        }
    }

    return { families, participants, untouched, errors, warnings };
}
