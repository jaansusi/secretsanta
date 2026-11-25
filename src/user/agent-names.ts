/**
 * Agent names: each participant's one codename ("Agent Musimops"), shown on the maze scoreboard instead of
 * real names, in their own dossier, and in their Santa's dossier, so a Santa can follow their target's
 * score while nobody else can tell who is who. Given the first time it is needed; the admin can change
 * it (the dossier's Codename field on the participant page).
 *
 * Edit the word list freely: names already given are stored and never change because of it.
 */
export const AGENT_NAME_PREFIX = 'Agent';

export const AGENT_NAME_WORDS = [
    'Musimops', 'Piparkook', 'Lumehelves', 'Kaneelirull', 'Mandariin', 'Martsipan', 'Jõulutäht', 'Põhjapõder',
    'Lumememm', 'Kuuseoks', 'Verivorst', 'Hapukapsas', 'Hõõgvein', 'Kelguke', 'Karupoeg', 'Siilike',
    'Pähklipureja', 'Kommipaber', 'Villasokk', 'Tutimüts', 'Lumepall', 'Jääpurikas', 'Kringel', 'Kuusekäbi',
    'Tähesära', 'Vahvel', 'Mustikas', 'Pohlamoos', 'Kakaokruus', 'Mesikäpp', 'Rebasepoeg', 'Oravake',
    'Härmatis', 'Lumehang', 'Kassipoeg', 'Piparmünt', 'Šokolaad', 'Kommipulk', 'Saanikell', 'Kuljus',
    'Päkapikk', 'Seapraad', 'Sült', 'Lumeingel', 'Pingviin', 'Hülgepoeg', 'Jänku', 'Tibuke',
    'Mõmmik', 'Kardemon', 'Rosin', 'Pannkook', 'Moosipurk', 'Vahukomm', 'Karamell', 'Iiris',
];

/** Longest agent name the admin may type. */
export const MAX_AGENT_NAME_LENGTH = 60;

/**
 * `count` new agent names that clash neither with each other nor with `taken` (compared ignoring case).
 * Words are picked at random; once every word is in use, numbers are added ("Agent Musimops 2").
 */
export function newAgentNames(taken: Iterable<string>, count: number, random: () => number = Math.random): string[] {
    const used = new Set([...taken].map(name => name.toLowerCase()));
    const out: string[] = [];
    for (let round = 1; out.length < count; round++) {
        const candidates = AGENT_NAME_WORDS
            .map(word => `${AGENT_NAME_PREFIX} ${word}${round > 1 ? ` ${round}` : ''}`)
            .filter(name => !used.has(name.toLowerCase()));
        while (candidates.length && out.length < count) {
            const [name] = candidates.splice(Math.floor(random() * candidates.length), 1);
            used.add(name.toLowerCase());
            out.push(name);
        }
    }
    return out;
}
