// Moves of a 3x3x3 cube, in standard notation, and their permutations.
//
// The face permutations are those of the 2003 Rubik's Cube Simulator.  The
// slice moves now also move the centers, so that a sequence of slice moves
// that looks solved is the identity.

import { Permutation } from './permutation';
import type {
	Cube,
	Face,
	Location,
	Move,
	MoveName,
	MoveToken,
	Rotation,
	Slice,
	Turns,
	CheckedAlg
} from './types';

export type { Face, Slice, Rotation, MoveName, Turns, Move } from './types';

export const FACES: readonly Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
export const SLICES: readonly Slice[] = ['M', 'E', 'S'];
export const ROTATIONS: readonly Rotation[] = ['x', 'y', 'z'];
export const MOVE_NAMES: readonly MoveName[] = [...FACES, ...SLICES, ...ROTATIONS];

export function isRotation(name: MoveName): name is Rotation {
	return ROTATIONS.some((r) => r === name);
}

export function isMoveName(name: string): name is MoveName {
	return MOVE_NAMES.some((m) => m === name);
}

// Clockwise quarter turns (as seen looking at the face).
const FACE_CYCLES: Record<Face, Location[][]> = {
	L: [
		['luf', 'lfd', 'ldb', 'lbu'],
		['lu', 'lf', 'ld', 'lb']
	],
	R: [
		['rfu', 'rub', 'rbd', 'rdf'],
		['ru', 'rb', 'rd', 'rf']
	],
	D: [
		['dlf', 'dfr', 'drb', 'dbl'],
		['df', 'dr', 'db', 'dl']
	],
	U: [
		['ufl', 'ulb', 'ubr', 'urf'],
		['uf', 'ul', 'ub', 'ur']
	],
	F: [
		['flu', 'fur', 'frd', 'fdl'],
		['fu', 'fr', 'fd', 'fl']
	],
	B: [
		['bul', 'bld', 'bdr', 'bru'],
		['bu', 'bl', 'bd', 'br']
	]
};

// Slices turning like R, U, and B: M', E', and S' (as the 2003 simulator
// defined its slices).
const SLICE_PRIME_CYCLES: Record<Slice, Location[][]> = {
	M: [
		['fu', 'ub', 'bd', 'df'],
		['f', 'u', 'b', 'd']
	],
	E: [
		['fl', 'lb', 'br', 'rf'],
		['f', 'l', 'b', 'r']
	],
	S: [
		['ul', 'ld', 'dr', 'ru'],
		['u', 'l', 'd', 'r']
	]
};

// A move name and a number of turns, as a key for POWERS, e.g. "R3".
type PowerKey = `${MoveName}${Turns}`;

const BASE = new Map<MoveName, Permutation>();
const POWERS = new Map<PowerKey, Permutation>();
for (const face of FACES) {
	BASE.set(face, new Permutation(FACE_CYCLES[face]));
}
for (const slice of SLICES) {
	const reversed = new Permutation(SLICE_PRIME_CYCLES[slice]);
	BASE.set(slice, reversed.inverse());
	POWERS.set(`${slice}3`, reversed);
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
	const key: PowerKey = `${name}${turns}`;
	let p = POWERS.get(key);
	if (p === undefined) {
		// Counterclockwise turns are inverses, as in 2003.
		const base = BASE.get(name);
		if (base === undefined) {
			throw new Error(`No permutation for move: ${name}`);
		}
		p = turns === 3 ? base.inverse() : base.power(turns);
		POWERS.set(key, p);
	}
	return p;
}

// Apply moves to a permutation.  A whole cube rotation doesn't change the
// arrangement of the pieces; it relabels them, so that the permutation is
// always relative to the way the cube is now held.
export function applyMoves(p: Cube, moves: Move[]): Cube {
	for (const { name, turns } of moves) {
		if (isRotation(name)) {
			p = perm(name, inverseTurns(turns)).compose(p).compose(perm(name, turns));
		} else {
			p = p.compose(perm(name, turns));
		}
	}
	return p;
}

export function permutationOf(moves: Move[]): Permutation {
	return applyMoves(new Permutation(), moves);
}

const INVERSE_TURNS: Readonly<Record<Turns, Turns>> = { 1: 3, 2: 2, 3: 1 };

export function inverseTurns(turns: Turns): Turns {
	return INVERSE_TURNS[turns];
}

export function invertMoves(moves: Move[]): Move[] {
	return moves
		.slice()
		.reverse()
		.map(({ name, turns }) => ({ name, turns: inverseTurns(turns) }));
}

const MOVE_PATTERN = /([UDLRFBMESxyz])(2'?|'|’)?/g;

// Parse standard notation, e.g. "R U R' U2".
// Moves written in source code, checked at compile time: alg("R U R' U'").
export function alg<S extends string>(text: CheckedAlg<S>): Move[] {
	return parseMoves(text);
}

// Parse text in standard notation (e.g. typed or pasted in); throws on
// anything that isn't a move.
export function parseMoves(st: string): Move[] {
	const moves: Move[] = [];
	const unknown = st.replace(MOVE_PATTERN, '').replace(/[\s()]/g, '');
	if (unknown !== '') {
		throw new Error(`Unknown moves: ${unknown}`);
	}
	for (const [, name, suffix] of st.matchAll(MOVE_PATTERN)) {
		const turns: Turns = suffix === undefined ? 1 : suffix.startsWith('2') ? 2 : 3;
		if (name === undefined || !isMoveName(name)) {
			throw new Error(`Unknown move: ${name}`);
		}
		moves.push({ name, turns });
	}
	return moves;
}

const TURNS_SUFFIX: Readonly<Record<Turns, '' | '2' | "'">> = { 1: '', 2: '2', 3: "'" };

export function formatMove({ name, turns }: Move): MoveToken {
	return `${name}${TURNS_SUFFIX[turns]}`;
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
	return turns === 1 || turns === 2 || turns === 3 ? [...rest, { name: move.name, turns }] : rest;
}

export function simplifyMoves(moves: Move[]): Move[] {
	return moves.reduce<Move[]>(appendMove, []);
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

// A scramble: random quarter turns of the faces, never the same face twice
// in a row (as in 2003).  `random` gives numbers in [0, 1).
export function randomScramble(length = 25, random: () => number = Math.random): Move[] {
	const moves: Move[] = [];
	let last: Face | undefined;
	while (moves.length < length) {
		const name = FACES[Math.floor(random() * FACES.length)];
		if (name === undefined || name === last) continue;
		last = name;
		moves.push({ name, turns: random() < 0.5 ? 3 : 1 });
	}
	return moves;
}
