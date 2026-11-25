import { LevelDefinition, MazeEngine, ParsedLevel } from './maze-engine';

/**
 * The maze levels. `par` (the shortest solution) is computed by the engine's solver at startup, so editing a level can never leave a stale target.
 * Ids are stored with results: keep them stable, and add new levels with new ids.
 */
export const LEVEL_DEFINITIONS: LevelDefinition[] = [
    {
        // The layout Jaan drew: a 7x7 box in the bottom-left of a 9x9 board, the bauble in the box's
        // bottom-left cell and the door in the top row. Shortest solution: 44 moves.
        id: 1,
        name: 'Agentuuri võimete test',
        world: [9, 9],
        mazeAt: [0, 2],
        ball: [0, 8],
        door: [1, 0],
        maze: [
            '+-+-+-+-+-+-+-+',
            '|           | |',
            '+ +-+ + +-+ + +',
            '|   |   |     |',
            '+-+ + + + + + +',
            '| |     |     |',
            '+ + + + +-+ + +',
            '|             |',
            '+ + + + + + + +',
            '|             |',
            '+-+ + + +-+ + +',
            '|   |         |',
            '+ + + + + + + +',
            '| |     |     |',
            '+-+-+-+-+-+-+-+',
        ],
    },
];

export interface Level {
    definition: LevelDefinition;
    parsed: ParsedLevel;
    /** Moves in the shortest solution. */
    par: number;
}

function load(): Level[] {
    return LEVEL_DEFINITIONS.map(definition => {
        const parsed = MazeEngine.parseLevel(definition);
        const solution = MazeEngine.solve(parsed);
        if (solution === null) {
            throw new Error(`Maze level ${definition.id} (${definition.name}) has no solution`);
        }
        return { definition, parsed, par: solution.length };
    });
}

/** Parsed and solved once at startup; a broken level stops the app instead of reaching players. */
export const LEVELS: Level[] = load();

export function levelById(id: number): Level | undefined {
    return LEVELS.find(level => level.definition.id === id);
}
