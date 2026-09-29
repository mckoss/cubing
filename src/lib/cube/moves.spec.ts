import { describe, expect, it } from 'vitest';
import { Permutation } from './permutation';
import {
	alg,
	appendMove,
	formatMoves,
	invertMoves,
	parseMoves,
	permutationOf,
	randomScramble,
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
		expect(permutationOf(alg("F U F' U'")).toString()).toBe('(uf ur lf) (urf ubr)- (ufl fdl)+');
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

describe('cycle notation', () => {
	it('prints the same permutation the same way, however it was made', () => {
		const a = new Permutation([['ur', 'uf', 'ub']]);
		const b = new Permutation([['fu', 'bu', 'ru']]);
		expect(a.toString()).toBe('(uf ub ur)');
		expect(b.toString()).toBe('(uf ub ur)');
		expect(permutationOf(alg("R U R' U'")).toString()).toBe(
			permutationOf(alg("R U R' U'")).inverse().inverse().toString()
		);
	});

	it('reads names from U or D where it can', () => {
		expect(permutationOf(alg('R U')).toString()).toBe(
			'(uf ul ub ur br dr fr) (urf)+ (ufl ulb ubr bdr dfr)-'
		);
		expect(permutationOf(alg('R')).toString()).toBe('(ur br dr fr) (urf bru drb frd)');
	});

	it('reads back what it prints', () => {
		for (const entry of CATALOG) {
			const p = permutationOf(entry.moves);
			expect(Permutation.parse(p.toString()).equals(p), entry.notation).toBe(true);
		}
		expect(Permutation.parse('()').isIdentity()).toBe(true);
		expect(Permutation.parse('(urf)+').apply('urf')).toBe('rfu');
		expect(() => Permutation.parse('(uf ur')).toThrow();
		expect(() => Permutation.parse('(ufr)')).toThrow(/clockwise/);
	});
});

describe('2003 compatibility', () => {
	// The effects the 2003 simulator computed, recorded from it (with its
	// moves written in standard notation).
	it('matches the 2003 simulator for every catalog entry', () => {
		const expected = new Map(reference.catalog.map(([moves, , cycles]) => [moves, cycles]));
		for (const entry of CATALOG) {
			expect(permutationOf(entry.moves).toString(), entry.notation).toBe(
				Permutation.parse(expected.get(entry.notation) ?? '').toString()
			);
		}
	});

	it('matches the 2003 simulator for single moves (ignoring centers)', () => {
		for (const [moves, , cycles] of reference.extra) {
			expect(centerlessCycles(permutationOf(parseMoves(moves)).toString()), moves).toBe(
				Permutation.parse(cycles).toString()
			);
		}
	});

	it('reduces like the 2003 simulator', () => {
		for (const [moves, reduced] of reference.reduce) {
			expect(formatMoves(reduceMoves(parseMoves(moves)))).toBe(formatMoves(parseMoves(reduced)));
		}
	});
});

describe('randomScramble', () => {
	it('makes quarter turns of the faces, never the same face twice in a row', () => {
		const moves = randomScramble(200);
		expect(moves).toHaveLength(200);
		for (const [i, move] of moves.entries()) {
			expect(['U', 'D', 'L', 'R', 'F', 'B']).toContain(move.name);
			expect([1, 3]).toContain(move.turns);
			expect(move.name).not.toBe(moves[i - 1]?.name);
		}
	});
});
