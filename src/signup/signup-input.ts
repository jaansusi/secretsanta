import { normalizeEmail } from 'src/user/user.service';

/** Which family the person joins: none, an existing one of the group, or a new one they name. */
export type FamilyChoice =
    | { kind: 'none' }
    | { kind: 'existing'; familyId: number }
    | { kind: 'new'; name: string };

export interface SignupInput {
    name: string;
    email: string;
    family: FamilyChoice;
}

export interface SignupContext {
    /** The group's families, for checking a chosen id and matching a "new" name to one that exists. */
    families: { id: number; name: string }[];
    /** The group's participants, for the per-group uniqueness of names and e-mails. */
    participants: { name: string; email: string | null }[];
    allowNewFamilies: boolean;
}

/** The form values to show again after an error, so nobody has to type everything twice. */
export interface SignupFormValues {
    name: string;
    email: string;
    family: string;
    newFamily: string;
}

export type SignupResult = { ok: true; input: SignupInput } | { ok: false; error: string; values: SignupFormValues };

const MAX_NAME = 100;
const MAX_EMAIL = 200;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Validates a sign-up form post (untrusted: anyone with the link). The `family` field is '' (no family), 'new'
 * (with `newFamily` as its name) or the id of one of the group's families. Errors are in Estonian, for the form.
 * A "new" family whose name matches an existing one (ignoring case) joins that family instead of failing.
 */
export function parseSignup(body: unknown, context: SignupContext): SignupResult {
    const values: SignupFormValues = {
        name: text(body, 'name').replace(/\s+/g, ' '),
        email: text(body, 'email'),
        family: text(body, 'family'),
        newFamily: text(body, 'newFamily').replace(/\s+/g, ' '),
    };
    const fail = (error: string): SignupResult => ({ ok: false, error, values });

    if (!values.name) return fail('Kirjuta oma nimi.');
    if (values.name.length > MAX_NAME) return fail(`Nimi võib olla kuni ${MAX_NAME} tähemärki.`);
    if (!values.email) return fail('Kirjuta oma e-posti aadress.');
    if (values.email.length > MAX_EMAIL || !EMAIL_PATTERN.test(values.email)) return fail('See ei paista olevat e-posti aadress.');
    const email = normalizeEmail(values.email);

    const lowerName = values.name.toLowerCase();
    if (context.participants.some(person => person.name.toLowerCase() === lowerName)) {
        return fail('Selle nimega osaleja on grupis juba olemas. Kui see pole sina, lisa nimele näiteks perekonnanimi.');
    }
    if (context.participants.some(person => person.email && normalizeEmail(person.email) === email)) {
        return fail('Selle e-posti aadressiga osaleja on grupis juba olemas.');
    }

    let family: FamilyChoice;
    if (values.family === '') {
        family = { kind: 'none' };
    } else if (values.family === 'new') {
        if (!context.allowNewFamilies) return fail('Uut perekonda siin luua ei saa. Vali olemasolev perekond või küsi korraldajalt.');
        if (!values.newFamily) return fail('Kirjuta uue perekonna nimi.');
        if (values.newFamily.length > MAX_NAME) return fail(`Perekonna nimi võib olla kuni ${MAX_NAME} tähemärki.`);
        const lowerFamily = values.newFamily.toLowerCase();
        const existing = context.families.find(candidate => candidate.name.toLowerCase() === lowerFamily);
        family = existing ? { kind: 'existing', familyId: existing.id } : { kind: 'new', name: values.newFamily };
    } else {
        const id = /^\d{1,10}$/.test(values.family) ? Number(values.family) : NaN;
        if (!context.families.some(candidate => candidate.id === id)) return fail('Seda perekonda ei leitud. Vali uuesti.');
        family = { kind: 'existing', familyId: id };
    }

    return { ok: true, input: { name: values.name, email, family } };
}

function text(body: unknown, key: string): string {
    const value = (body as Record<string, unknown> | null | undefined)?.[key];
    return typeof value === 'string' ? value.trim() : '';
}
