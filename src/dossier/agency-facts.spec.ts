import { DEFAULT_AGENCY_FACTS, assignAgencyFacts } from './agency-facts';

const ids = (count: number, from = 1) => Array.from({ length: count }, (_, i) => from + i);

/** How often each fact is shown. */
function usage(assigned: Map<number, string[]>, facts: string[]): number[] {
    const all = [...assigned.values()].flat();
    return facts.map(fact => all.filter(text => text === fact).length);
}

describe('assignAgencyFacts', () => {
    it('gives everyone the requested number of distinct facts', () => {
        const assigned = assignAgencyFacts(ids(30), DEFAULT_AGENCY_FACTS, 3);
        expect(assigned.size).toBe(30);
        for (const facts of assigned.values()) {
            expect(facts).toHaveLength(3);
            expect(new Set(facts).size).toBe(3);
        }
    });

    it('uses every fact once before any fact twice, and so on', () => {
        const facts = DEFAULT_AGENCY_FACTS.slice(0, 20);
        for (const people of [3, 6, 7, 13, 25, 40]) {
            const counts = usage(assignAgencyFacts(ids(people), facts, 3), facts);
            expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        }
        // 87 facts, 25 people x 3 = 75: no fact repeats.
        expect(Math.max(...usage(assignAgencyFacts(ids(25), DEFAULT_AGENCY_FACTS, 3), DEFAULT_AGENCY_FACTS))).toBe(1);
    });

    it('gives everyone a different combination, and keeps shared pairs rare', () => {
        const facts = DEFAULT_AGENCY_FACTS.slice(0, 12);
        const assigned = assignAgencyFacts(ids(40), facts, 3);
        const combos = [...assigned.values()].map(list => [...list].sort().join('|'));
        expect(new Set(combos).size).toBe(40);
        // 40 x 3 pairs = 120 over 66 possible pairs: no pair should be shown more than three times.
        const pairs = new Map<string, number>();
        for (const list of assigned.values()) {
            const sorted = [...list].sort();
            for (let a = 0; a < sorted.length; a++) {
                for (let b = a + 1; b < sorted.length; b++) {
                    const key = `${sorted[a]}|${sorted[b]}`;
                    pairs.set(key, (pairs.get(key) ?? 0) + 1);
                }
            }
        }
        expect(Math.max(...pairs.values())).toBeLessThanOrEqual(3);
    });

    it('is stable, and someone joining later changes nobody else\'s facts', () => {
        const before = assignAgencyFacts([12, 3, 7], DEFAULT_AGENCY_FACTS, 3);
        expect(assignAgencyFacts([7, 12, 3], DEFAULT_AGENCY_FACTS, 3)).toEqual(before);
        const after = assignAgencyFacts([12, 3, 7, 40], DEFAULT_AGENCY_FACTS, 3);
        for (const id of [3, 7, 12]) {
            expect(after.get(id)).toEqual(before.get(id));
        }
        expect(after.get(40)).toHaveLength(3);
    });

    it('handles short lists, zero and no facts', () => {
        expect([...assignAgencyFacts([1], ['a', 'b'], 3).get(1)!].sort()).toEqual(['a', 'b']);
        expect(assignAgencyFacts([1], DEFAULT_AGENCY_FACTS, 0).get(1)).toEqual([]);
        expect(assignAgencyFacts([1], [], 3).get(1)).toEqual([]);
        expect(assignAgencyFacts([], DEFAULT_AGENCY_FACTS, 3).size).toBe(0);
    });
});
