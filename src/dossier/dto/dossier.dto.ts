import { SantaClipLibrary } from '../santa-clips';

/** Text fields editable by the admin. */
export class SaveDossierDto {
    codename?: string;
    missionBrief?: string;
}

/** Dossier metadata without the binary assets. */
export class DossierSummaryDto {
    userId: number;
    codename: string;
    missionBrief: string;
    hasPhoto: boolean;
    hasAudio: boolean;
}

/** What the Santa receives together with the recipient's name. */
export class RevealDossierDto {
    codename: string;
    missionBrief: string;
    facts: string[];
    hasPhoto: boolean;
    /** A hand-made clip stored in the dossier table, played when no generated name clip exists. */
    hasAudio: boolean;
    /** Pre-generated clips: how many intros/outros exist and this recipient's name clips. */
    clips: SantaClipLibrary;
}

export interface DossierAsset {
    data: Buffer;
    mimeType: string;
}
