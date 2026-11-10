import { execSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { DEFAULT_AGENCY_FACTS, pickAgencyFacts } from './agency-facts';

describe('pickAgencyFacts', () => {
    it('picks the same facts the browser used to pick, so nobody\'s dossier changes', () => {
        // The browser script as it was before the facts moved into the database.
        const original = execSync('git show 0c64a08:public/js/dossier-facts.js', { encoding: 'utf8' });
        const sandbox: any = {};
        runInNewContext(`${original}\nthis.facts = OUTRAGEOUS_FACTS; this.pick = outrageousFacts;`, sandbox);
        expect(DEFAULT_AGENCY_FACTS).toEqual(sandbox.facts);
        for (const name of ['Jaan Susi', 'Mari-Liis Õunapuu', '2', 'Jüri Tamm', 'A']) {
            expect(pickAgencyFacts(name, DEFAULT_AGENCY_FACTS, 3)).toEqual(sandbox.pick(name, 3));
        }
    });

    it('is stable per name and returns distinct facts', () => {
        const first = pickAgencyFacts('Kati Kask', DEFAULT_AGENCY_FACTS, 5);
        expect(pickAgencyFacts('Kati Kask', DEFAULT_AGENCY_FACTS, 5)).toEqual(first);
        expect(new Set(first).size).toBe(5);
    });

    it('handles short lists and zero', () => {
        expect(pickAgencyFacts('Kati', ['a', 'b'], 3).sort()).toEqual(['a', 'b']);
        expect(pickAgencyFacts('Kati', DEFAULT_AGENCY_FACTS, 0)).toEqual([]);
        expect(pickAgencyFacts('Kati', [], 3)).toEqual([]);
    });
});
