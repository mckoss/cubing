import { describe, expect, it } from 'vitest';
import { Permutation } from './permutation';
import {
	alg,
	appendMove,
	formatMoves,
	invertMoves,
	parseMoves,
	permutationOf,
	reduceMoves,
	simplifyMoves,
	type Move
} from './moves';
import { CATALOG } from './catalog';
import referenceJson from './fixtures/reference-2003.json';

// Moves, label, and cycles; or moves and their reduction.
interface Reference {
	catalog: [string, string, string][];
	extra: [string, string, string][];
	reduce: [string, string][];
}

const reference = referenceJson as Reference;

// The 2003 code didn't move the centers; drop their cycles before comparing.
function centerlessCycles(cycles: string): string {
	const kept = cycles.match(/\([^)]*\)[+-]?/g)?.filter((c) => /\w\w/.test(c)) ?? [];
	return kept.length === 0 ? '()' : kept.join(' ');
}

describe('Permutation', () => {
	it('maps rotated names', () => {
		const p = new Permutation([['ufl', 'ulb']]);
		expect(p.apply('ufl')).toBe('ulb');
		expect(p.apply('flu')).toBe('lbu');
		expect(p.apply('uf')).toBe('uf');
	});

	it('composes, inverts and powers', () => {
		const r = permutationOf(alg('R'));
		expect(r.power(4).isIdentity()).toBe(true);
		expect(r.compose(r.inverse()).isIdentity()).toBe(true);
		expect(r.power(3).equals(permutationOf(alg("R'")))).toBe(true);
		expect(permutationOf(alg("R U R' U'")).power(6).isIdentity()).toBe(true);
	});

	it('shows twisted cycles', () => {
		expect(permutationOf(alg("F U F' U'")).toString()).toBe('(flu dlf)+ (fl fu ru) (ubr fur)-');
		expect(permutationOf(alg('')).toString()).toBe('()');
	});
});

describe('moves', () => {
	it('parses and formats standard notation', () => {
		expect(formatMoves(parseMoves("R U2 R' x y' M2'"))).toBe("R U2 R' x y' M2");
		expect(() => parseMoves('Q')).toThrow();
	});

	it('has the right order for every move', () => {
		for (const name of 'UDLRFBMESxyz') {
			expect(permutationOf(parseMoves(name)).isIdentity(), name).toBe('xyz'.includes(name));
			expect(permutationOf(parseMoves(`${name}2 ${name}2`)).isIdentity(), name).toBe(true);
			expect(permutationOf(parseMoves(`${name} ${name}'`)).isIdentity(), name).toBe(true);
		}
	});

	it('matches rotations to face and slice turns', () => {
		expect(permutationOf(alg("R M' L'")).equals(permutationOf(alg("L' M' R")))).toBe(true);
		// After turning the cube with x, the Front face is what was the Down face.
		expect(permutationOf(alg("x F x'")).equals(permutationOf(alg('D')))).toBe(true);
		expect(permutationOf(alg("y R y'")).equals(permutationOf(alg('B')))).toBe(true);
		expect(permutationOf(alg("z U z'")).equals(permutationOf(alg('L')))).toBe(true);
	});

	it('undoes a sequence with its inverse', () => {
		const moves = parseMoves("R U F' L2 D B' M E' S x y2 z'");
		expect(permutationOf([...moves, ...invertMoves(moves)]).isIdentity()).toBe(true);
	});

	it('combines moves of the same face', () => {
		expect(formatMoves(parseMoves('F F F').reduce<Move[]>(appendMove, []))).toBe("F'");
		expect(formatMoves(simplifyMoves(parseMoves("R U U' R' F F")))).toBe('F2');
	});

	it('reduces sequences that return to an earlier arrangement', () => {
		expect(formatMoves(reduceMoves(parseMoves("R U F' F U' L")))).toBe('R L');
		expect(
			formatMoves(
				reduceMoves(parseMoves("R U R' U' R U R' U' R U R' U' R U R' U' R U R' U' R U R' U'"))
			)
		).toBe('');
	});
});

describe('2003 compatibility', () => {
	// The effects the 2003 simulator computed, recorded from it (with its
	// moves written in standard notation).
	it('matches the 2003 simulator for every catalog entry', () => {
		const expected = new Map(reference.catalog.map(([moves, , cycles]) => [moves, cycles]));
		for (const entry of CATALOG) {
			expect(permutationOf(entry.moves).toString(), entry.notation).toBe(
				expected.get(entry.notation)
			);
		}
	});

	it('matches the 2003 simulator for single moves (ignoring centers)', () => {
		for (const [moves, , cycles] of reference.extra) {
			expect(centerlessCycles(permutationOf(parseMoves(moves)).toString()), moves).toBe(cycles);
		}
	});

	it('reduces like the 2003 simulator', () => {
		for (const [moves, reduced] of reference.reduce) {
			expect(formatMoves(reduceMoves(parseMoves(moves)))).toBe(formatMoves(parseMoves(reduced)));
		}
	});
});
