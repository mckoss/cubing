import { describe, expect, it } from 'vitest';
import { parseRubikon } from './parse';
import type { Algo, Expr, Let } from './ast';
import {
	engineMoves,
	evaluateLets,
	evaluateModule,
	evaluateMoves,
	formatTaggedMoves,
	RubikonEvalError,
	type Env,
	type Moves
} from './moves';
import { formatMoves, isRotation, MOVE_NAMES, parseMoves, permutationOf } from '../cube/moves';
import { Permutation } from '../cube/permutation';
import { LOCATIONS, type Location } from '../cube/types';
import basicSource from '../../../rubikon/basic.rbk?raw';
import cfopSource from '../../../rubikon/cfop.rbk?raw';
import singmasterSource from '../../../rubikon/singmaster.rbk?raw';

// The value of `let v = <source>`.
function expr(source: string): Expr {
	const def = parseRubikon(`let v = ${source}`).defs[0];
	if (def?.kind !== 'let') {
		throw new Error('not a let');
	}
	return def.value;
}

function evaluate(source: string, env: Env = new Map()): Moves {
	return evaluateMoves(expr(source), env);
}

// Moves as text, tags dropped.
function text(source: string, env: Env = new Map()): string {
	return formatMoves(engineMoves(evaluate(source, env)));
}

function cycles(source: string, env: Env = new Map()): string {
	return permutationOf(engineMoves(evaluate(source, env))).toString();
}

function evalError(source: string, env: Env = new Map()): RubikonEvalError {
	try {
		evaluate(source, env);
	} catch (e) {
		if (e instanceof RubikonEvalError) {
			return e;
		}
		throw e;
	}
	throw new Error(`no error: ${source}`);
}

describe('evaluateMoves', () => {
	it('evaluates moves and sequences', () => {
		expect(text("R U R' U2")).toBe("R U R' U2");
		expect(text('()')).toBe('');
		expect(text("M2 E S' x y2 z'")).toBe("M2 E S' x y2 z'");
	});

	it('inverts, reversing the moves', () => {
		expect(text("(R U2 F')'")).toBe("F U2 R'");
		expect(text('inverse(R U)')).toBe("U' R'");
		expect(text("(R U)''")).toBe('R U');
	});

	it('repeats', () => {
		expect(text("(R U R' U')3")).toBe("R U R' U' R U R' U' R U R' U'");
		expect(text("(R U)3'")).toBe(formatMoves(parseMoves("U' R' U' R' U' R'")));
		expect(text('(R)0')).toBe('');
		expect(text('(R)1000')).toHaveLength(1000 * 2 - 1);
	});

	it('conjugates', () => {
		expect(text('F<commutator(R, U)>')).toBe(formatMoves(parseMoves("F R U R' U' F'")));
		expect(text("F<R U>'")).toBe("F U' R' F'");
		expect(text('(F<R U>)2')).toBe("F R U F' F R U F'");
		expect(text('t<F<D>>', new Map([['t', evaluate('U2')]]))).toBe("U2 F D F' U2");
	});

	it("makes commutators in cubers' order", () => {
		expect(text('commutator(R, U)')).toBe("R U R' U'");
		expect(cycles('commutator(U, R)')).toBe(cycles("commutator(R, U)'"));
	});

	it('looks up names, bare and qualified', () => {
		const env = new Map([
			['sexy', evaluate("R U R' U'")],
			['cfop.sune', evaluate("R U R' U R U2 R'")]
		]);
		expect(text("sexy'", env)).toBe("U R U' R'");
		expect(text('F<cfop.sune>', env)).toBe("F R U R' U R U2 R' F'");
	});

	it('mirrors through M, E, and S', () => {
		expect(text("reflect(U R U', M)")).toBe("U' L' U");
		expect(text('reflect(R L F B U D, M)')).toBe("L' R' F' B' U' D'");
		expect(text('reflect(R U F, E)')).toBe("R' D' F'");
		expect(text('reflect(R U F, S)')).toBe("R' U' B'");
		// Turns about the axis through the mirror keep their sense.
		expect(text('reflect(x M y E z S, M)')).toBe("x M y' E' z' S'");
		expect(text('reflect(x M y E z S, E)')).toBe("x' M' y E z' S'");
		expect(text('reflect(x M y E z S, S)')).toBe("x' M' y' E' z S");
	});

	it('mirrors the effect of every move, as the engine sees it', () => {
		// Whole cube turns change only the frame, so check them by what
		// they do to a face turn after them.
		const suffixes = ['', "'", '2'];
		const sources = MOVE_NAMES.flatMap((name) =>
			suffixes.flatMap((suffix) =>
				isRotation(name)
					? ['R', 'U', 'F'].map((face) => `${name}${suffix} ${face}`)
					: [`${name}${suffix}`]
			)
		);
		for (const mirror of ['M', 'E', 'S'] as const) {
			for (const source of sources) {
				const mirrored = mirrorPermutation(permutationOf(parseMoves(source)), mirror);
				expect(cycles(`reflect(${source}, ${mirror})`), `${source} in ${mirror}`).toBe(
					mirrored.toString()
				);
			}
		}
	});

	it('tags whole cube turns shown by show()', () => {
		const moves = evaluate("show(x) R y show(z2) show(y')");
		expect(moves.map((m) => m.visible)).toEqual([true, true, false, true, true]);
		expect(formatTaggedMoves(moves)).toBe("show(x) R y show(z2) show(y')");
		// The tags stay with their moves.
		expect(formatTaggedMoves(evaluate("(show(x) R y)'"))).toBe("y' R' show(x')");
		expect(formatTaggedMoves(evaluate('reflect(show(y) R, M)'))).toBe("show(y') L'");
	});

	it('reports errors with where they happened', () => {
		const unknown = evalError('R\n  nope');
		expect(unknown.message).toBe('2:3: Unknown name: nope');
		expect(unknown.line).toBe(2);
		expect(unknown.column).toBe(3);
		expect(evalError('cfop.nope').message).toContain('Unknown name: cfop.nope');
		expect(evalError('show(R)').message).toContain('show takes one whole cube turn');
		expect(evalError('show(x y)').message).toContain('show takes one whole cube turn');
		expect(evalError('show(x, y)').message).toContain('show takes 1 argument, not 2');
		expect(evalError('commutator(R)').message).toContain('commutator takes 2 arguments, not 1');
		expect(evalError('reflect(R, x)').message).toContain('reflect needs a slice');
		expect(evalError('reflect(R, M2)').message).toContain('reflect needs a slice');
		expect(evalError('R uf').message).toBe('1:11: Expected moves, but this is a location');
		expect(evalError('R /df/').message).toContain('a pattern');
		expect(evalError('R (uf ur ub)').message).toContain('a permutation');
		expect(evalError('solved(df)').message).toContain('Unknown function: solved');
		expect(evalError('Rw').message).toContain('Wide turns');
		expect(evalError('(R U)1001').message).toBe('1:9: Repeat count too large (at most 1000)');
		expect(evalError('(R)99999999999999999999').message).toContain('Repeat count too large');
	});
});

// A permutation seen in a mirror: each place is mirrored, and corner names
// respelled clockwise (the mirror of urf reads ufl).
function mirrorPermutation(p: Permutation, mirror: 'M' | 'E' | 'S'): Permutation {
	const swap: Record<string, string> = { M: 'lr', E: 'ud', S: 'fb' };
	const [a, b] = swap[mirror] ?? '';
	const mirrorLoc = (loc: Location): Location => {
		const letters = [...loc].map((c) => (c === a ? b : c === b ? a : c));
		const [first, ...rest] = letters;
		const name = [first, ...(rest.length === 2 ? rest.reverse() : rest)].join('');
		const found = LOCATIONS.find((l) => l === name);
		if (found === undefined) {
			throw new Error(`no mirror of ${loc}`);
		}
		return found;
	};
	const result = new Permutation();
	for (const loc of LOCATIONS) {
		result.addMap(mirrorLoc(loc), mirrorLoc(p.apply(loc)));
	}
	return result;
}

// Each let in a file's source, with the comment on the line after it.
function letComments(source: string): Map<string, string> {
	const lines = source.split('\n');
	const found = new Map<string, string>();
	lines.forEach((line, i) => {
		const name = /^\s*let\s+(\w+)/.exec(line)?.[1];
		const comment = /^\s*#\s*(.*?)\s*$/.exec(lines[i + 1] ?? '')?.[1];
		if (name !== undefined && comment !== undefined) {
			found.set(name, comment);
		}
	});
	return found;
}

function mainAlgo(source: string): Algo {
	const main = parseRubikon(source).defs.find((d) => d.kind === 'algo' && d.name === 'main');
	if (main?.kind !== 'algo') {
		throw new Error('no main');
	}
	return main;
}

const cfop = evaluateModule(parseRubikon(cfopSource), new Map());
const basicFile = parseRubikon(basicSource);
const basicTop = evaluateModule(basicFile, new Map([['cfop', cfop.exports]]));
const basic = evaluateLets(mainAlgo(basicSource).body, basicTop.scope);
const singmaster = evaluateLets(mainAlgo(singmasterSource).body, new Map());

describe('the example files', () => {
	const files: [string, string, Env][] = [
		['cfop.rbk', cfopSource, cfop.scope],
		['basic.rbk', basicSource, basic],
		['singmaster.rbk', singmasterSource, singmaster]
	];

	it('finds every let and its comment', () => {
		const counts = files.map(([, source]) => letComments(source).size);
		expect(counts).toEqual([12, 7, 12]);
		expect(counts.reduce((x, y) => x + y)).toBe(31);
	});

	for (const [file, source, env] of files) {
		for (const [name, comment] of letComments(source)) {
			it(`${file}: ${name} makes ${comment}`, () => {
				const moves = env.get(name);
				expect(moves).toBeDefined();
				expect(permutationOf(engineMoves(moves ?? [])).toString()).toBe(comment);
			});
		}
	}

	it('evaluates to the expected moves', () => {
		const get = (env: Env, name: string): string => formatMoves(engineMoves(env.get(name) ?? []));
		expect(text("twistCorner'", basic)).toBe("R' D' R D R' D' R D");
		expect(get(cfop.exports, 'hPerm')).toBe('M2 U M2 U2 M2 U M2');
		expect(get(cfop.exports, 'sune')).toBe("R U R' U R U2 R'");
		expect(get(basic, 'insertRight')).toBe("U R U' R' U' F' U F");
		expect(get(basic, 'insertLeft')).toBe("U' L' U L U F U' F'");
		expect(formatTaggedMoves(cfop.exports.get('aPerm') ?? [])).toBe(
			"show(x) R' U R' D2 R U' R' D2 R2 show(x')"
		);
	});

	it('exports only what a module defines', () => {
		expect([...cfop.exports.keys()]).toHaveLength(12);
		expect(basicTop.scope.has('sune')).toBe(true);
		expect(basicTop.exports.has('sune')).toBe(false);
	});
});

describe('evaluateModule', () => {
	const modules = new Map([['cfop', cfop.exports]]);

	it('imports modules qualified, renamed, and by name', () => {
		const file = parseRubikon("import cfop as c\nfrom cfop import sune as s\nlet v = c.sexy s'");
		const { scope, exports } = evaluateModule(file, modules);
		expect(formatMoves(engineMoves(scope.get('v') ?? []))).toBe("R U R' U' R U2 R' U' R U' R'");
		expect(scope.has('cfop.sexy')).toBe(false);
		expect([...exports.keys()]).toEqual(['v']);
	});

	it('reports unknown modules and names, and names defined twice', () => {
		const error = (source: string): string => {
			try {
				evaluateModule(parseRubikon(source), modules);
			} catch (e) {
				if (e instanceof RubikonEvalError) {
					return e.message;
				}
				throw e;
			}
			return 'no error';
		};
		expect(error('from other import sune')).toBe('1:1: Unknown module: other');
		expect(error('from cfop import nope')).toBe('1:1: cfop has no nope');
		expect(error('from cfop import sune\nlet sune = R')).toBe('2:1: Already defined: sune');
		expect(error('let a = R\nlet a = U')).toBe('2:1: Already defined: a');
		expect(error('from cfop import sune\nfrom cfop import sexy as sune')).toContain(
			'Imported twice: sune'
		);
		expect(error('let a = c\nlet c = R')).toBe('1:9: Unknown name: c');
	});

	it('lets a later milestone bind names, like a search variable', () => {
		const lets = parseRubikon("let v = t F2 t'").defs.filter((d): d is Let => d.kind === 'let');
		const env = evaluateLets(lets, new Map([['t', evaluate('U')]]));
		expect(formatMoves(engineMoves(env.get('v') ?? []))).toBe("U F2 U'");
	});
});
