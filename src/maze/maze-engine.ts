import { join } from 'node:path';

/**
 * Typed access to public/js/maze-engine.js. The rules live in that one plain-JS file so the browser and
 * the server replay moves with exactly the same code (dist/maze and src/maze are both two levels below
 * the project root, where public/ sits, in the image too).
 */
export type Move = 'U' | 'D' | 'L' | 'R';

export interface LevelDefinition {
    id: number;
    name: string;
    /** World size in cells: [width, height]. */
    world: [number, number];
    /** Top-left world cell of the maze box at the start. */
    mazeAt: [number, number];
    ball: [number, number];
    door: [number, number];
    /** Maze box as text, see the format in maze-engine.js. */
    maze: string[];
}

export interface MazeState {
    ox: number;
    oy: number;
    bx: number;
    by: number;
}

export interface ParsedLevel {
    id: number;
    name: string;
    world: { w: number; h: number };
    box: { w: number; h: number };
    start: MazeState;
    door: { x: number; y: number };
}

interface Engine {
    parseLevel(def: LevelDefinition): ParsedLevel;
    step(level: ParsedLevel, state: MazeState, move: Move): { state: MazeState; pushed: boolean; blocked?: undefined } | { blocked: 'edge' | 'ball' };
    replay(level: ParsedLevel, moves: string): { ok: boolean; reason: string | null; moves: number; state: MazeState };
    solve(level: ParsedLevel): string | null;
    stars(moves: number, par: number): number;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const MazeEngine: Engine = require(join(__dirname, '..', '..', 'public', 'js', 'maze-engine.js'));
