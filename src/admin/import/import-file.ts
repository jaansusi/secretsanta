import { EncryptionStrategy } from 'src/encryption/encryption.service';

/**
 * The data file the admin import accepts ("secretsanta" format, version 1).
 *
 * Its shape follows the current database, not any older one: field names are the `family` and `user`
 * columns, and an assignment is stored the way the app stores it today (giftingTo = base64 of the
 * recipient's name, kept with the Santa's decryptionCode; no iv). Ids are only references inside the
 * file (familyId, lastYearGiftingToId); the import maps them onto the ids in the database.
 *
 * {
 *   "format": "secretsanta", "version": 1,
 *   "exportedAt": "2026-11-11T10:00:00Z", "source": "free text, shown in the activity log",
 *   "families": [{ "id": 1, "name": "Susid" }],
 *   "participants": [{
 *     "id": 1, "name": "Mari", "email": "mari@example.com", "familyId": 1, "isAdmin": false,
 *     "encryptionStrategy": "code", "giftingTo": "<base64 name>", "decryptionCode": "<code in the link>",
 *     "lastYearGiftingToId": 2, "interestingFacts": "one fact per line"
 *   }]
 * }
 */
export const IMPORT_FORMAT = 'secretsanta';
export const IMPORT_VERSION = 1;

export interface ImportFamily {
    id: number;
    name: string;
}

export interface ImportParticipant {
    id: number;
    name: string;
    email: string | null;
    familyId: number | null;
    isAdmin: boolean;
    encryptionStrategy: EncryptionStrategy;
    giftingTo: string | null;
    decryptionCode: string | null;
    lastYearGiftingToId: number | null;
    interestingFacts: string | null;
}

export interface ImportFile {
    source: string | null;
    exportedAt: string | null;
    families: ImportFamily[];
    participants: ImportParticipant[];
}

const MAX_NAME = 100;
const MAX_EMAIL = 200;
const MAX_FACTS = 5000;
const MAX_CODE = 200;
const MAX_ROWS = 1000;

/**
 * Validates an uploaded file and returns it normalized (emails folded with `normalizeEmail`, optional
 * fields defaulted). Collects every problem instead of stopping at the first, so one upload shows them all.
 * Returns `{ errors }` when anything is wrong; nothing in the file is trusted beyond what is checked here.
 */
export function parseImportFile(data: unknown, normalizeEmail: (email: string) => string): { file?: ImportFile; errors: string[] } {
    const errors: string[] = [];
    if (!isObject(data)) {
        return { errors: ['The file is not a JSON object.'] };
    }
    if (data.format !== IMPORT_FORMAT) {
        return { errors: [`Not a Secret Santa data file (expected "format": "${IMPORT_FORMAT}").`] };
    }
    if (data.version !== IMPORT_VERSION) {
        return { errors: [`Unsupported file version ${JSON.stringify(data.version)}; this app reads version ${IMPORT_VERSION}.`] };
    }
    if (!Array.isArray(data.families)) errors.push('"families" must be a list.');
    if (!Array.isArray(data.participants)) errors.push('"participants" must be a list.');
    if (errors.length) return { errors };
    if (data.families.length > MAX_ROWS || data.participants.length > MAX_ROWS) {
        return { errors: [`The file has more than ${MAX_ROWS} rows in a list.`] };
    }

    const families: ImportFamily[] = [];
    data.families.forEach((raw: unknown, index: number) => {
        const where = `families[${index}]`;
        if (!isObject(raw)) { errors.push(`${where} is not an object.`); return; }
        const id = readId(raw.id, `${where}.id`, errors);
        const name = readText(raw.name, `${where}.name`, MAX_NAME, errors, true);
        if (id !== null && name) families.push({ id, name });
    });

    const participants: ImportParticipant[] = [];
    data.participants.forEach((raw: unknown, index: number) => {
        const where = `participants[${index}]`;
        if (!isObject(raw)) { errors.push(`${where} is not an object.`); return; }
        const label = typeof raw.name === 'string' && raw.name.trim() ? `${where} (${raw.name.trim()})` : where;
        const id = readId(raw.id, `${label}.id`, errors);
        const name = readText(raw.name, `${label}.name`, MAX_NAME, errors, true);
        let email = readText(raw.email, `${label}.email`, MAX_EMAIL, errors);
        if (email) {
            email = normalizeEmail(email);
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push(`${label}.email does not look like an e-mail address.`);
        }
        const strategy = raw.encryptionStrategy ?? EncryptionStrategy.CODE;
        if (!Object.values(EncryptionStrategy).includes(strategy)) {
            errors.push(`${label}.encryptionStrategy must be one of ${Object.values(EncryptionStrategy).join(', ')}.`);
        }
        if (raw.isAdmin !== undefined && raw.isAdmin !== null && typeof raw.isAdmin !== 'boolean') {
            errors.push(`${label}.isAdmin must be true or false.`);
        }
        const giftingTo = readText(raw.giftingTo, `${label}.giftingTo`, 1000, errors);
        const decryptionCode = readText(raw.decryptionCode, `${label}.decryptionCode`, MAX_CODE, errors);
        if (id === null || !name) return;
        participants.push({
            id,
            name,
            email: email || null,
            familyId: readOptionalRef(raw.familyId, `${label}.familyId`, errors),
            isAdmin: raw.isAdmin === true,
            encryptionStrategy: strategy,
            giftingTo: giftingTo || null,
            decryptionCode: decryptionCode || null,
            lastYearGiftingToId: readOptionalRef(raw.lastYearGiftingToId, `${label}.lastYearGiftingToId`, errors),
            interestingFacts: readText(raw.interestingFacts, `${label}.interestingFacts`, MAX_FACTS, errors) || null,
        });
    });

    duplicates(families.map(f => f.id), id => `Two families have id ${id}.`, errors);
    duplicates(families.map(f => f.name.toLowerCase()), name => `Two families are called "${name}".`, errors);
    duplicates(participants.map(p => p.id), id => `Two participants have id ${id}.`, errors);
    duplicates(participants.map(p => p.name.toLowerCase()), name => `Two participants are called "${name}".`, errors);
    duplicates(participants.flatMap(p => p.email ? [p.email] : []), email => `Two participants have the e-mail ${email}.`, errors);
    duplicates(participants.flatMap(p => p.decryptionCode ? [p.decryptionCode] : []), () => 'Two participants have the same decryption code.', errors);

    const familyIds = new Set(families.map(f => f.id));
    const byId = new Map(participants.map(p => [p.id, p]));
    const names = new Set(participants.map(p => p.name));
    for (const p of participants) {
        if (p.familyId !== null && !familyIds.has(p.familyId)) {
            errors.push(`${p.name}: familyId ${p.familyId} is not in "families".`);
        }
        if (p.lastYearGiftingToId !== null) {
            if (p.lastYearGiftingToId === p.id) errors.push(`${p.name}: last year's recipient is the person themselves.`);
            else if (!byId.has(p.lastYearGiftingToId)) errors.push(`${p.name}: lastYearGiftingToId ${p.lastYearGiftingToId} is not in "participants".`);
        }
        if (p.giftingTo) {
            if (p.encryptionStrategy !== EncryptionStrategy.CODE) {
                errors.push(`${p.name}: an assignment is only supported with the "code" strategy.`);
            } else if (!p.decryptionCode) {
                errors.push(`${p.name}: has an assignment (giftingTo) but no decryptionCode.`);
            } else {
                const recipient = decodeBase64Name(p.giftingTo);
                if (recipient === null) errors.push(`${p.name}: giftingTo is not a base64-encoded name.`);
                else if (recipient === p.name) errors.push(`${p.name}: is assigned to themselves.`);
                else if (!names.has(recipient)) errors.push(`${p.name}: is assigned to "${recipient}", who is not in "participants".`);
            }
        }
    }

    if (errors.length) return { errors };
    return {
        errors,
        file: {
            source: typeof data.source === 'string' ? data.source.slice(0, 200) : null,
            exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 40) : null,
            families,
            participants,
        },
    };
}

/** The recipient name inside a base64 assignment, or null if it is not valid base64 text. */
export function decodeBase64Name(value: string): string | null {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
    const text = Buffer.from(value, 'base64').toString('utf8');
    return text && !text.includes('�') ? text : null;
}

function isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readId(value: unknown, where: string, errors: string[]): number | null {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        errors.push(`${where} must be a positive whole number.`);
        return null;
    }
    return value as number;
}

function readOptionalRef(value: unknown, where: string, errors: string[]): number | null {
    if (value === undefined || value === null) return null;
    return readId(value, where, errors);
}

function readText(value: unknown, where: string, max: number, errors: string[], required = false): string {
    if (value === undefined || value === null) {
        if (required) errors.push(`${where} is required.`);
        return '';
    }
    if (typeof value !== 'string') {
        errors.push(`${where} must be text.`);
        return '';
    }
    const text = value.trim();
    if (required && !text) errors.push(`${where} is required.`);
    if (text.length > max) errors.push(`${where} is longer than ${max} characters.`);
    return text;
}

function duplicates<T>(values: T[], message: (value: T) => string, errors: string[]) {
    const seen = new Set<T>();
    for (const value of values) {
        if (seen.has(value)) errors.push(message(value));
        seen.add(value);
    }
}
