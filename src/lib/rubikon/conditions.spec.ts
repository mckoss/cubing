import { describe, expect, it } from 'vitest';
import { EMPTY_ENV, envOf, evaluateCondition, RubikonConditionError, type Env } from './conditions';
import { parseRubikon } from './parse';
import type { Algo, Cond, PatternLit } from './ast';
import { Permutation } from '../cube/permutation';
import { parseMoves, perm, permutationOf } from '../cube/moves';

// The goal of `algo goal <source> { }`.
function cond(source: string): Cond {
	const def = parseRubikon(`algo goal ${source} { }`).defs[0] as Algo | undefined;
	if (def?.goal === null || def?.goal === undefined) {
		throw new Error(`no goal: ${source}`);
	}
	return def.goal;
}

function after(moves: string): Permutation {
	return permutationOf(parseMoves(moves));
}

function check(source: string, state: Permutation, env: Env = EMPTY_ENV): boolean {
	return evaluateCondition(cond(source), state, env);
}

// A pattern literal, as a value to bind to a name.
function pattern(source: string): {
	kind: 'pattern';
	cells: PatternLit['cells'];
	anyRotation: boolean;
} {
	const c = cond(`uf is ${source}`);
	if (c.kind !== 'is' || c.pattern.kind !== 'pattern') {
		throw new Error('not a pattern');
	}
	return { kind: 'pattern', cells: c.pattern.cells, anyRotation: c.pattern.anyRotation };
}

const SOLVED = Permutation.identity();

describe('is', () => {
	it('reads a solved place against its own pattern', () => {
		expect(check('uf is /uf/', SOLVED)).toBe(true);
		expect(check('fu is /fu/', SOLVED)).toBe(true);
		expect(check('uf is /fu/', SOLVED)).toBe(false);
		expect(check('rfu is /rfu/', SOLVED)).toBe(true);
		expect(check('urf is /rfu/', SOLVED)).toBe(false);
		expect(check('u is /u/', SOLVED)).toBe(true);
	});

	it('finds a piece moved by a face turn', () => {
		// F2 takes uf to df, and df to uf.
		const state = after('F2');
		expect(check('uf is /df/', state)).toBe(true);
		expect(check('df is /uf/', state)).toBe(true);
		expect(check('uf is /uf/', state)).toBe(false);
		// R takes fr to ur, its f sticker up.
		expect(check('ur is /fr/', after('R'))).toBe(true);
	});

	it('sees a flipped edge', () => {
		const state = Permutation.parse('(uf)+ (ub)+');
		expect(check('uf is /fu/', state)).toBe(true);
		expect(check('uf is /uf/', state)).toBe(false);
		expect(check('uf is not /uf/', state)).toBe(true);
		expect(check('uf is /uf/r', state)).toBe(true);
		expect(check('uf is /u_/', state)).toBe(false);
		expect(check('uf is /_u/', state)).toBe(true);
		expect(check('uf is /!u_/', state)).toBe(true);
		expect(check('ur is /!u_/', state)).toBe(false);
	});

	it('reads corner twists in the place’s letter order', () => {
		// (commutator(D', R'))2, basic.rbk's twistCorner, twists urf clockwise.
		const clockwise = after("D' R' D R D' R' D R");
		expect(clockwise.toString()).toContain('(urf)+');
		// The u sticker went to the r face: reading u, r, f, it's second.
		expect(check('urf is /_u_/', clockwise)).toBe(true);
		expect(check('urf is /u__/', clockwise)).toBe(false);
		expect(check('urf is /__u/', clockwise)).toBe(false);
		expect(check('rfu is /u__/', clockwise)).toBe(true);
		expect(check('urf is /fur/', clockwise)).toBe(true);
		expect(check('urf is /urf/r', clockwise)).toBe(true);

		const counter = after("R' D' R D R' D' R D");
		expect(counter.toString()).toContain('(urf)-');
		expect(check('urf is /__u/', counter)).toBe(true);
		expect(check('urf is /_u_/', counter)).toBe(false);
		expect(check('urf is /rfu/', counter)).toBe(true);
		expect(check('urf is /urf/', counter)).toBe(false);
		expect(check('urf is /urf/r', counter)).toBe(true);
	});

	it('matches any rotation with /r', () => {
		expect(check('urf is /u__/r', after("R' D' R D R' D' R D"))).toBe(true);
		expect(check('urf is /d__/r', SOLVED)).toBe(false);
		expect(check('dfr is /u__/r', after("R'"))).toBe(true);
		expect(check('dfr is /u__/r', after('R'))).toBe(false);
		expect(check('uf is /fu/r', SOLVED)).toBe(true);
		expect(check('uf is /ub/r', SOLVED)).toBe(false);
	});

	it('never matches a pattern for another kind of piece', () => {
		expect(check('urf is /u_/', SOLVED)).toBe(false);
		expect(check('urf is /__/r', SOLVED)).toBe(false);
		expect(check('uf is /u__/', SOLVED)).toBe(false);
		expect(check('uf is not /u__/', SOLVED)).toBe(true);
		expect(check('u is /uf/', SOLVED)).toBe(false);
	});

	it('handles ! cells', () => {
		expect(check('uf is /!d!d/', SOLVED)).toBe(true);
		expect(check('uf is /!u_/', SOLVED)).toBe(false);
		expect(check('urf is /!u!u!u/', SOLVED)).toBe(false);
		expect(check('dfr is /!u!u!u/', SOLVED)).toBe(true);
	});

	it('tests a place against a bound pattern', () => {
		const env = envOf({ p: pattern('/df/r') });
		expect(check('df is p', SOLVED, env)).toBe(true);
		expect(check('uf is p', SOLVED, env)).toBe(false);
		expect(check('uf is p', after('F2'), env)).toBe(true);
		expect(check('uf is not p', after('F2'), env)).toBe(false);
	});

	it('takes places bound to names', () => {
		const env = envOf({ here: { kind: 'location', name: 'uf' } });
		expect(check('here is /df/', after('F2'), env)).toBe(true);
		expect(check('solved(here)', after('F2'), env)).toBe(false);
	});

	it('reports unknown names with their position', () => {
		const run = (): boolean => check('uf is q', SOLVED);
		expect(run).toThrow(RubikonConditionError);
		expect(run).toThrow(/^1:17: Unknown name: q/);
	});
});

describe('colors relative to the centers', () => {
	it('follows the centers after a whole cube turn', () => {
		// A raw y moves the centers with everything else.
		const y = perm('y');
		expect(check('fr is /fr/', y)).toBe(true);
		expect(check('solved(fr fl br bl)', y)).toBe(true);
		// The cube turned with a raw y (centers and all), then R: relative to
		// the centers, the same as R alone.
		const turned = y.compose(after('R'));
		const plain = after('R');
		expect(turned.equals(plain)).toBe(false);
		for (const source of [
			'fr is /fr/',
			'ur is /fr/',
			'uf is /u_/',
			'solved(layer(L))',
			'dr is /fr/r',
			'urf is /u__/',
			'rfu is /u__/'
		]) {
			expect(check(source, turned)).toBe(check(source, plain));
		}
		// R, then the cube turned (y takes f to l): the untouched left layer
		// is now at the back, with its centers, so it reads as solved there.
		const afterY = after('R').compose(y);
		expect(check('bl is /bl/', afterY)).toBe(true);
		expect(check('solved(layer(B))', afterY)).toBe(true);
		expect(check('solved(layer(L))', afterY)).toBe(false);
		// The front right holds the piece R put at the back right, with its
		// top color on the right; its other color was r's, now the front's.
		expect(check('rf is /uf/', afterY)).toBe(true);
		expect(check('fr is /ur/', afterY)).toBe(false);
	});

	it('reads the engine’s frame changes the same way', () => {
		// applyMoves relabels on a whole cube turn, so the centers stay put.
		expect(after('y').isIdentity()).toBe(true);
		const state = after("y R y'");
		// R in the frame after y is B in the original frame.
		expect(check('solved(layer(F))', state)).toBe(true);
		expect(check('solved(layer(B))', state)).toBe(false);
	});

	it('counts a slice as unsolved: the centers are displaced', () => {
		const state = after('M');
		expect(check('solved(cube)', state)).toBe(false);
		// Relative to the centers, M looks like R and L turned (L' R): the
		// slice's own places read as solved, and R's and L's don't.
		expect(check('solved(layer(M))', state)).toBe(true);
		expect(check('solved(uf)', state)).toBe(true);
		expect(check('solved(layer(R))', state)).toBe(false);
		expect(check('solved(ur)', state)).toBe(false);
	});
});

describe('solved, placed, layer', () => {
	it('solved(cube) holds however the cube is held', () => {
		expect(check('solved(cube)', SOLVED)).toBe(true);
		expect(check('solved(cube)', perm('y'))).toBe(true);
		expect(check('solved(cube)', perm('x', 3).compose(perm('z')))).toBe(true);
		expect(check('solved(cube)', after('y'))).toBe(true);
		expect(check('solved(cube)', after('R'))).toBe(false);
		expect(check('solved(cube)', after('R y'))).toBe(false);
		expect(check('solved(cube)', after("M E2 M' E2"))).toBe(false);
	});

	it('solved(places) after known moves', () => {
		const state = after("R U R' U'");
		expect(check('solved(df dl db)', state)).toBe(true);
		expect(check('solved(uf)', state)).toBe(true);
		expect(check('solved(ur)', state)).toBe(false);
		expect(check('solved(df dr db dl)', state)).toBe(true);
		expect(check('solved(fr)', state)).toBe(false);
		expect(check('solved(layer(L))', state)).toBe(false);
		expect(check('solved(layer(D))', state)).toBe(false);
		expect(check('not solved(layer(D))', state)).toBe(true);
	});

	it('placed ignores twists', () => {
		const state = after("R' D' R D R' D' R D");
		expect(check('solved(urf)', state)).toBe(false);
		expect(check('placed(urf)', state)).toBe(true);
		expect(check('placed(urf ufl ulb ubr)', state)).toBe(true);
		expect(check('placed(layer(D))', state)).toBe(false);
		expect(check('placed(uf ur ub ul)', Permutation.parse('(uf)+ (ur)+'))).toBe(true);
		expect(check('placed(uf ur)', Permutation.parse('(uf ur) (ub ul)'))).toBe(false);
	});

	it('layer() names a face’s places, or a slice’s', () => {
		const state = after('U');
		expect(check('solved(layer(D))', state)).toBe(true);
		expect(check('solved(layer(D) layer(E))', state)).toBe(true);
		expect(check('solved(layer(U))', state)).toBe(false);
		expect(check('solved(layer(D) df)', after('F'))).toBe(false);
		// E is the four middle edges (and centers): U and D turns leave it.
		expect(check('solved(layer(E))', after('U D'))).toBe(true);
		expect(check('solved(layer(E))', after('R'))).toBe(false);
		expect(() => check('solved(layer(x))', SOLVED)).toThrow(RubikonConditionError);
		expect(() => check('solved(layer(D2))', SOLVED)).toThrow(RubikonConditionError);
	});
});

describe('face pictures', () => {
	const cross = 'face U [_u_ / uuu / _u_]';
	const line = 'face U [_!u_ / uuu / _!u_]';
	const ell = 'face U [_u_ / uu!u / _!u_]';
	const dot = 'face U [_!u_ / !uu!u / _!u_]';
	const pictures = [cross, line, ell, dot];

	function which(state: Permutation): string[] {
		return pictures.filter((p) => check(p, state));
	}

	it('tells the Top Cross cases apart', () => {
		expect(which(SOLVED)).toEqual([cross]);
		expect(which(Permutation.parse('(uf)+ (ub)+'))).toEqual([line]);
		expect(which(Permutation.parse('(uf)+ (ur)+'))).toEqual([ell]);
		expect(which(Permutation.parse('(uf)+ (ur)+ (ub)+ (ul)+'))).toEqual([dot]);
		// Turned a quarter, the line runs front to back: no case matches.
		expect(which(Permutation.parse('(ul)+ (ur)+'))).toEqual([]);
	});

	it('reads the L that topCross (F<sexy>) makes', () => {
		// (ur ub fu) (urf ufl)+ (ubr ulb)-: uf and ur are flipped, so the
		// top color's edges are at the back left.
		const state = after("F R U R' U' F'");
		expect(which(state)).toEqual([ell]);
		// Turned with U2, the L is at the front right: no case.
		expect(which(state.compose(perm('U', 2)))).toEqual([]);
		// topCross on the L makes the line.
		expect(which(state.compose(after("F R U R' U' F'")))).toEqual([line]);
		// And on the line, the cross.
		expect(which(Permutation.parse('(uf)+ (ub)+').compose(after("F R U R' U' F'")))).toEqual([
			cross
		]);
	});

	it('only reads U so far', () => {
		expect(() => check('face D [___ / ___ / ___]', SOLVED)).toThrow(/Not yet/);
	});

	it('follows the centers', () => {
		expect(check(cross, perm('x'))).toBe(true);
		expect(check(cross, perm('z', 2))).toBe(true);
	});
});

describe('and, or, not', () => {
	const state = after("R U R' U'");

	it('binds not tighter than and, and and tighter than or', () => {
		// solved(uf) true, solved(ur) false, solved(df) true.
		expect(check('solved(ur) and solved(uf) or solved(df)', state)).toBe(true);
		expect(check('solved(ur) and (solved(uf) or solved(df))', state)).toBe(false);
		expect(check('not solved(ur) and solved(uf)', state)).toBe(true);
		expect(check('not solved(uf) or solved(df)', state)).toBe(true);
		expect(check('not (solved(uf) or solved(ur))', state)).toBe(false);
		expect(check('solved(uf) and not solved(ur) and solved(df)', state)).toBe(true);
	});
});

describe('==', () => {
	it('compares places, patterns, and permutations', () => {
		expect(check('uf == uf', SOLVED)).toBe(true);
		expect(check('uf == fu', SOLVED)).toBe(false);
		expect(check('/df/ == /df/', SOLVED)).toBe(true);
		expect(check('/df/ == /fd/', SOLVED)).toBe(false);
		expect(check('cube == ()', SOLVED)).toBe(true);
		expect(check('cube == (uf ul ub ur) (ufl ulb ubr urf)', after('U'))).toBe(true);
		expect(check('cube == (urf)+', after("D' R' D R D' R' D R"))).toBe(false);
	});

	it('leaves moves to the moves evaluator', () => {
		expect(() => check("cube == R U R' U'", SOLVED)).toThrow(/Not yet/);
	});
});

describe('not yet', () => {
	it('goal and has', () => {
		const until = (parseRubikon('algo { until goal max 1 { } }').defs[0] as Algo).body[0];
		if (until?.kind !== 'until') {
			throw new Error('no until');
		}
		expect(() => evaluateCondition(until.cond, SOLVED)).toThrow(/Not yet/);
		expect(() => check('cube has (uf ur ub)', SOLVED)).toThrow(/Not yet/);
	});
});
