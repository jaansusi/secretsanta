import { AGENT_NAME_WORDS, newAgentNames } from './agent-names';

describe('agent names', () => {
    it('gives unique "Agent <word>" names that avoid the ones taken', () => {
        const names = newAgentNames(['agent musimops'], 5);
        expect(names).toHaveLength(5);
        expect(new Set(names.map(name => name.toLowerCase())).size).toBe(5);
        expect(names.every(name => /^Agent \S+$/.test(name))).toBe(true);
        expect(names).not.toContain('Agent Musimops');
    });

    it('adds numbers once every word is in use', () => {
        const names = newAgentNames([], AGENT_NAME_WORDS.length + 2, () => 0);
        expect(names.slice(0, 2)).toEqual([`Agent ${AGENT_NAME_WORDS[0]}`, `Agent ${AGENT_NAME_WORDS[1]}`]);
        expect(names.slice(-2)).toEqual([`Agent ${AGENT_NAME_WORDS[0]} 2`, `Agent ${AGENT_NAME_WORDS[1]} 2`]);
        expect(new Set(names).size).toBe(names.length);
    });

    it('has no duplicate words in the list', () => {
        expect(new Set(AGENT_NAME_WORDS.map(word => word.toLowerCase())).size).toBe(AGENT_NAME_WORDS.length);
    });
});
