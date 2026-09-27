// Moves of a 3x3x3 cube, in standard notation, and their permutations.
//
// The face permutations are those of the 2003 Rubik's Cube Simulator.  The
// slice moves now also move the centers, so that a sequence of slice moves
// that looks solved is the identity.

import { Permutation } from './permutation';

export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Slice = 'M' | 'E' | 'S';
export type Rotation = 'x' | 'y' | 'z';
export type MoveName = Face | Slice | Rotation;

// A quarter turn clockwise (1), half turn (2), or quarter turn
// counterclockwise (3).
export type Turns = 1 | 2 | 3;

export interface Move {
	name: MoveName;
	turns: Turns;
}

export const FACES: readonly Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
export const SLICES: readonly Slice[] = ['M', 'E', 'S'];
export const ROTATIONS: readonly Rotation[] = ['x', 'y', 'z'];
export const MOVE_NAMES: readonly MoveName[] = [...FACES, ...SLICES, ...ROTATIONS];

export function isRotation(name: MoveName): name is Rotation {
	return (ROTATIONS as readonly string[]).includes(name);
}

// Clockwise quarter turns (as seen looking at the face).
const FACE_CYCLES: Record<Face, string[][]> = {
	L: [
		['LUF', 'LFD', 'LDB', 'LBU'],
		['LU', 'LF', 'LD', 'LB']
	],
	R: [
		['RFU', 'RUB', 'RBD', 'RDF'],
		['RU', 'RB', 'RD', 'RF']
	],
	D: [
		['DLF', 'DFR', 'DRB', 'DBL'],
		['DF', 'DR', 'DB', 'DL']
	],
	U: [
		['UFL', 'ULB', 'UBR', 'URF'],
		['UF', 'UL', 'UB', 'UR']
	],
	F: [
		['FLU', 'FUR', 'FRD', 'FDL'],
		['FU', 'FR', 'FD', 'FL']
	],
	B: [
		['BUL', 'BLD', 'BDR', 'BRU'],
		['BU', 'BL', 'BD', 'BR']
	]
};

// Slices, as defined in 2003: turning like R, U, and B.  In standard
// notation these are M', E', and S'.
const SLICE_CYCLES_2003: Record<Slice, string[][]> = {
	M: [
		['FU', 'UB', 'BD', 'DF'],
		['F', 'U', 'B', 'D']
	],
	E: [
		['FL', 'LB', 'BR', 'RF'],
		['F', 'L', 'B', 'R']
	],
	S: [
		['UL', 'LD', 'DR', 'RU'],
		['U', 'L', 'D', 'R']
	]
};

const BASE = new Map<MoveName, Permutation>();
const POWERS = new Map<string, Permutation>();
for (const face of FACES) {
	BASE.set(face, new Permutation(FACE_CYCLES[face]));
}
for (const slice of SLICES) {
	const reversed = new Permutation(SLICE_CYCLES_2003[slice]);
	BASE.set(slice, reversed.inverse());
	POWERS.set(slice + 3, reversed);
}
// Whole cube rotations, built as in 2003: x turns like R, y like U, and z
// like F (2003's "k" turned like B, so it is z').
BASE.set('x', perm('L', 3).compose(perm('M', 3)).compose(perm('R')));
BASE.set('y', perm('D', 3).compose(perm('E', 3)).compose(perm('U')));
const zPrime = perm('F', 3).compose(perm('S', 3)).compose(perm('B'));
BASE.set('z', zPrime.inverse());
POWERS.set('z3', zPrime);

// The permutation for a move, e.g. perm('R', 3) for R'.
export function perm(name: MoveName, turns: Turns = 1): Permutation {
	const key = name + turns;
	let p = POWERS.get(key);
	if (p === undefined) {
		// Counterclockwise turns are inverses, as in 2003.
		const base = BASE.get(name)!;
		p = turns === 3 ? base.inverse() : base.power(turns);
		POWERS.set(key, p);
	}
	return p;
}

// Apply moves to a permutation.  A whole cube rotation doesn't change the
// arrangement of the pieces; it relabels them, so that the permutation is
// always relative to the way the cube is now held.
export function applyMoves(p: Permutation, moves: Move[]): Permutation {
	for (const { name, turns } of moves) {
		if (isRotation(name)) {
			p = perm(name, inverseTurns(turns)).compose(p).compose(perm(name, turns));
		} else {
			p = p.compose(perm(name, turns));
		}
	}
	return p;
}

export function permutationOf(moves: Move[] | string): Permutation {
	return applyMoves(new Permutation(), typeof moves === 'string' ? parseMoves(moves) : moves);
}

export function inverseTurns(turns: Turns): Turns {
	return (4 - turns) as Turns;
}

export function invertMoves(moves: Move[]): Move[] {
	return moves
		.slice()
		.reverse()
		.map(({ name, turns }) => ({ name, turns: inverseTurns(turns) }));
}

const MOVE_PATTERN = /([UDLRFBMESxyz])(2'?|'|’)?/g;

// Parse standard notation, e.g. "R U R' U2".
export function parseMoves(st: string): Move[] {
	const moves: Move[] = [];
	const unknown = st.replace(MOVE_PATTERN, '').replace(/[\s()]/g, '');
	if (unknown !== '') {
		throw new Error(`Unknown moves: ${unknown}`);
	}
	for (const [, name, suffix] of st.matchAll(MOVE_PATTERN)) {
		const turns: Turns = suffix === undefined ? 1 : suffix.startsWith('2') ? 2 : 3;
		moves.push({ name: name as MoveName, turns });
	}
	return moves;
}

export function formatMove({ name, turns }: Move): string {
	return name + ['', '', '2', "'"][turns];
}

export function formatMoves(moves: Move[]): string {
	return moves.map(formatMove).join(' ');
}

// Add a move to a list, combining it with the last move if they turn the
// same face.  (The 2003 simulator combined "f" and "F", and "ff" + "f".)
export function appendMove(moves: Move[], move: Move): Move[] {
	const last = moves[moves.length - 1];
	if (last === undefined || last.name !== move.name) {
		return [...moves, move];
	}
	const turns = (last.turns + move.turns) % 4;
	const rest = moves.slice(0, -1);
	return turns === 0 ? rest : [...rest, { name: move.name, turns: turns as Turns }];
}

export function simplifyMoves(moves: Move[]): Move[] {
	return moves.reduce(appendMove, [] as Move[]);
}

// Remove any sequence of moves that returns the cube to an arrangement it
// was in before.  (The 2003 simulator's "Reduce" button.)
export function reduceMoves(moves: Move[]): Move[] {
	const seen = new Map<string, Move[]>();
	let p = new Permutation();
	let result: Move[] = [];

	seen.set(p.toString(), result);
	for (const move of moves) {
		p = applyMoves(p, [move]);
		const key = p.toString();
		const earlier = seen.get(key);
		if (earlier !== undefined) {
			// Go back to the moves that first reached this arrangement.
			result = earlier;
			continue;
		}
		result = [...result, move];
		seen.set(key, result);
	}
	return result;
}

// The 2003 simulator used one letter per move: lower case for clockwise and
// upper case for counterclockwise.  x, y, and z were slices (turning like
// R, U, and B), and i, j, and k turned the whole cube (like R, U, and B).
const NOTATION_2003: Record<string, Move> = {
	l: { name: 'L', turns: 1 },
	r: { name: 'R', turns: 1 },
	d: { name: 'D', turns: 1 },
	u: { name: 'U', turns: 1 },
	f: { name: 'F', turns: 1 },
	b: { name: 'B', turns: 1 },
	x: { name: 'M', turns: 3 },
	y: { name: 'E', turns: 3 },
	z: { name: 'S', turns: 3 },
	i: { name: 'x', turns: 1 },
	j: { name: 'y', turns: 1 },
	k: { name: 'z', turns: 3 }
};

export function from2003Notation(st: string): Move[] {
	const moves: Move[] = [];
	for (const ch of st.replace(/\s/g, '')) {
		const move = NOTATION_2003[ch.toLowerCase()];
		if (move === undefined) {
			throw new Error(`Unknown 2003 move: ${ch}`);
		}
		const reverse = ch !== ch.toLowerCase();
		moves.push(reverse ? { name: move.name, turns: inverseTurns(move.turns) } : move);
	}
	return moves;
}

const TO_2003 = new Map(
	Object.entries(NOTATION_2003).map(([ch, move]) => [move.name + move.turns, ch])
);

// Convert moves to the 2003 notation (a half turn is two letters).
export function to2003Notation(moves: Move[]): string {
	return moves
		.map(({ name, turns }) => {
			const clockwise = TO_2003.get(name + 1);
			if (clockwise !== undefined) {
				return turns === 3 ? clockwise.toUpperCase() : clockwise.repeat(turns);
			}
			const counter = TO_2003.get(name + 3)!;
			return turns === 1 ? counter.toUpperCase() : counter.repeat(turns === 2 ? 2 : 1);
		})
		.join('');
}

// Apply moves written in the 2003 notation.
export function apply2003(p: Permutation, st: string): Permutation {
	return applyMoves(p, from2003Notation(st));
}

// The inverse of a sequence in the 2003 notation: reversed, changing case.
export function invert2003(st: string): string {
	return [...st]
		.reverse()
		.map((ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()))
		.join('');
}
