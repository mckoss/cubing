// The Move Catalog from the 2003 Rubik's Cube Simulator: useful sequences
// from Mike's 2003 notes, with their labels.  Groups of moves are separated
// by two spaces, as they were grouped in the notes.

import { parseMoves, type Move } from './moves';
import type { CheckedAlg } from './types';

export interface CatalogEntry {
	label: string;
	moves: Move[];
	// The moves as written in the notes (for display).
	notation: string;
}

// An entry, with its moves checked at compile time.
function entry<S extends string>(notation: CheckedAlg<S>, label: string): CatalogEntry {
	return { label, moves: parseMoves(notation), notation };
}

export const CATALOG: CatalogEntry[] = [
	entry('F2', '1a'),
	entry("F' U' R U", '1b'),
	entry("D' R' D R", '2a'),
	entry("D F D' F'", '2b'),
	entry("F D2 F'  D2  R' D R", '2c'),
	entry("L U  U2 F2 U2 F2 U2 F2  U' L'", '3a'),
	entry("B' U  R2 U2 R2 U2 R2 U2  U' B", '3b'),
	entry("B  L U L' U'  B'", '4a'),
	entry("B  U L U' L'  B'", '4b'),
	entry("R2 D'  U2 R' L F2 R L'  D R2", '6bi'),
	entry("R2 D'  R' L F2 R L' U2  D R2", '6bii'),
	entry("R2 D2 B2 D  L2 F2 L2 F2 L2 F2  D' B2 D2 R2", '6c'),
	entry("L'  U R U' R'  L  R U R' U'", '7bi'),
	entry("U R U' R'  L'  R U R' U'  L", '7bii'),
	entry("B  L U L' U'  L U L' U'  L U L' U'  B'", '7c'),
	entry("R' B2  F R F' R'  F R F' R'  F R F' R'  B2 R", '7d'),
	entry("F D F' D'  F D F' D'", '8a'),
	entry("D F D' F'  D F D' F'", '8b'),
	entry('F2 U2  F2 U2  F2 U2', 'P1(f,u)'),
	entry("F U F' U'", 'P2(f,u)'),
	entry("F U F' U'  F U F' U'", 'P3(f,u) = P2(f,u)^2'),
	entry("F U F' U'  F U F' U'  F U F' U'", 'P4(f,u) = P2(f,u)^3'),
	entry("R' L  F2  R L'  U2", '')
];
