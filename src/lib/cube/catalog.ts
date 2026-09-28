// The Move Catalog from the 2003 Rubik's Cube Simulator: useful sequences
// from Mike's 2003 notes, with their labels.  Groups of moves are separated
// by two spaces, as they were grouped in the notes.

import { parseMoves, type Move } from './moves';
import type { Notation } from './types';

export interface CatalogEntry {
	label: string;
	moves: Move[];
	notation: Notation;
}

const SEQUENCES: [notation: Notation, label: string][] = [
	['F2', '1a'],
	["F' U' R U", '1b'],
	["D' R' D R", '2a'],
	["D F D' F'", '2b'],
	["F D2 F'  D2  R' D R", '2c'],
	["L U  U2 F2 U2 F2 U2 F2  U' L'", '3a'],
	["B' U  R2 U2 R2 U2 R2 U2  U' B", '3b'],
	["B  L U L' U'  B'", '4a'],
	["B  U L U' L'  B'", '4b'],
	["R2 D'  U2 R' L F2 R L'  D R2", '6bi'],
	["R2 D'  R' L F2 R L' U2  D R2", '6bii'],
	["R2 D2 B2 D  L2 F2 L2 F2 L2 F2  D' B2 D2 R2", '6c'],
	["L'  U R U' R'  L  R U R' U'", '7bi'],
	["U R U' R'  L'  R U R' U'  L", '7bii'],
	["B  L U L' U'  L U L' U'  L U L' U'  B'", '7c'],
	["R' B2  F R F' R'  F R F' R'  F R F' R'  B2 R", '7d'],
	["F D F' D'  F D F' D'", '8a'],
	["D F D' F'  D F D' F'", '8b'],
	['F2 U2  F2 U2  F2 U2', 'P1(f,u)'],
	["F U F' U'", 'P2(f,u)'],
	["F U F' U'  F U F' U'", 'P3(f,u) = P2(f,u)^2'],
	["F U F' U'  F U F' U'  F U F' U'", 'P4(f,u) = P2(f,u)^3'],
	["R' L  F2  R L'  U2", '']
];

export const CATALOG: CatalogEntry[] = SEQUENCES.map(([notation, label]) => ({
	label,
	moves: parseMoves(notation),
	notation
}));
