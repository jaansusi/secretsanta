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
    hasAudio: boolean;
}

export interface DossierAsset {
    data: Buffer;
    mimeType: string;
}
