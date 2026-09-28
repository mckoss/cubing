import { describe, expect, it } from 'vitest';
import { Permutation } from './permutation';
import {
	appendMove,
	formatMoves,
	invertMoves,
	parseMoves,
	permutationOf,
	reduceMoves,
	simplifyMoves
} from './moves';
import { CATALOG } from './catalog';
import reference from './fixtures/reference-2003.json';

// The 2003 code didn't move the centers; drop their cycles before comparing.
function centerlessCycles(cycles: string): string {
	const kept = cycles.match(/\([^)]*\)[+-]?/g)?.filter((c) => /\w\w/.test(c)) ?? [];
	return kept.length === 0 ? '<Identity>' : kept.join(' ');
}

describe('Permutation', () => {
	it('maps rotated names', () => {
		const p = new Permutation([['UFL', 'ULB']]);
		expect(p.apply('UFL')).toBe('ULB');
		expect(p.apply('FLU')).toBe('LBU');
		expect(p.apply('UF')).toBe('UF');
	});

	it('composes, inverts and powers', () => {
		const r = permutationOf('R');
		expect(r.power(4).isIdentity()).toBe(true);
		expect(r.compose(r.inverse()).isIdentity()).toBe(true);
		expect(r.power(3).equals(permutationOf("R'"))).toBe(true);
		expect(permutationOf("R U R' U'").power(6).isIdentity()).toBe(true);
	});

	it('shows twisted cycles', () => {
		expect(permutationOf("F U F' U'").toString()).toBe('(FLU DLF)+ (FL FU RU) (UBR FUR)-');
		expect(permutationOf('').toString()).toBe('<Identity>');
	});
});

describe('moves', () => {
	it('parses and formats standard notation', () => {
		expect(formatMoves(parseMoves("R U2 R' x y' M2'"))).toBe("R U2 R' x y' M2");
		expect(() => parseMoves('Q')).toThrow();
	});

	it('has the right order for every move', () => {
		for (const name of 'UDLRFBMESxyz') {
			expect(permutationOf(name).isIdentity(), name).toBe('xyz'.includes(name));
			expect(permutationOf(`${name}2 ${name}2`).isIdentity(), name).toBe(true);
			expect(permutationOf(`${name} ${name}'`).isIdentity(), name).toBe(true);
		}
	});

	it('matches rotations to face and slice turns', () => {
		expect(permutationOf("R M' L'").equals(permutationOf("L' M' R"))).toBe(true);
		// After turning the cube with x, the Front face is what was the Down face.
		expect(permutationOf("x F x'").equals(permutationOf('D'))).toBe(true);
		expect(permutationOf("y R y'").equals(permutationOf('B'))).toBe(true);
		expect(permutationOf("z U z'").equals(permutationOf('L'))).toBe(true);
	});

	it('undoes a sequence with its inverse', () => {
		const moves = parseMoves("R U F' L2 D B' M E' S x y2 z'");
		expect(permutationOf([...moves, ...invertMoves(moves)]).isIdentity()).toBe(true);
	});

	it('combines moves of the same face', () => {
		const f = parseMoves('F')[0];
		expect(formatMoves([f, f, f].reduce(appendMove, []))).toBe("F'");
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
			expect(centerlessCycles(permutationOf(moves).toString()), moves).toBe(cycles);
		}
	});

	it('reduces like the 2003 simulator', () => {
		for (const [moves, reduced] of reference.reduce) {
			expect(formatMoves(reduceMoves(parseMoves(moves)))).toBe(formatMoves(parseMoves(reduced)));
		}
	});
});
