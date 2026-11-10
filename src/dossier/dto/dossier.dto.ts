
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
    photoBytes?: number;
    audioBytes?: number;
    photoMimeType?: string | null;
    audioMimeType?: string | null;
    updatedAt?: Date | null;
}

/** What the Santa receives together with the recipient's name. */
export class RevealDossierDto {
    codename: string;
    missionBrief: string;
    facts: string[];
    hasPhoto: boolean;
    /** A hand-made clip stored in the dossier table, played when no generated name clip exists. */
    hasAudio: boolean;
    /** URLs of this recipient's generated name clips, in name line order. */
    clips: { names: string[] };
    /** Made-up "agency intelligence" lines for this recipient. */
    agencyFacts: string[];
}

export interface DossierAsset {
    data: Buffer;
    mimeType: string;
}
