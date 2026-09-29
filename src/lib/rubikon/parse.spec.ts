import { describe, expect, it } from 'vitest';
import { parseRubikon, RubikonSyntaxError } from './parse';
import type { Algo, Cond, Expr, Let, RubikonFile, Statement } from './ast';
import basicSource from '../../../rubikon/basic.rbk?raw';
import cfopSource from '../../../rubikon/cfop.rbk?raw';
import singmasterSource from '../../../rubikon/singmaster.rbk?raw';

// The tree without source positions, for comparing shapes.
function strip(node: unknown): unknown {
	if (Array.isArray(node)) {
		return node.map(strip);
	}
	if (node !== null && typeof node === 'object') {
		return Object.fromEntries(
			Object.entries(node)
				.filter(([key]) => key !== 'loc')
				.map(([key, value]) => [key, strip(value)])
		);
	}
	return node;
}

function first<T>(items: readonly T[]): T {
	const item = items[0];
	if (item === undefined) {
		throw new Error('empty');
	}
	return item;
}

// The value of `let v = <source>`.
function expr(source: string): unknown {
	const def = first(parseRubikon(`let v = ${source}`).defs) as Let;
	return strip(def.value);
}

// The goal of `algo goal <source> { }`.
function cond(source: string): unknown {
	const def = first(parseRubikon(`algo goal ${source} { }`).defs) as Algo;
	return strip(def.goal);
}

// The statements of `algo { <source> }`.
function body(source: string): Statement[] {
	return (first(parseRubikon(`algo { ${source} }`).defs) as Algo).body;
}

function move(name: string, turns: 1 | 2 | 3 = 1): unknown {
	return { kind: 'move', name, turns };
}

function name(n: string, module: string | null = null): unknown {
	return { kind: 'name', module, name: n };
}

function place(n: string): unknown {
	return { kind: 'location', name: n };
}

function seq(...items: unknown[]): unknown {
	return { kind: 'seq', items };
}

function syntaxError(source: string): RubikonSyntaxError {
	try {
		parseRubikon(source);
	} catch (e) {
		if (e instanceof RubikonSyntaxError) {
			return e;
		}
		throw e;
	}
	throw new Error(`parsed: ${source}`);
}

describe('moves', () => {
	it('reads moves in standard notation', () => {
		expect(expr("R U2 F' Rw M2 y' x2")).toEqual(
			seq(
				move('R'),
				move('U', 2),
				move('F', 3),
				move('Rw'),
				move('M', 2),
				move('y', 3),
				move('x', 2)
			)
		);
	});

	it("inverts names and groups with '", () => {
		expect(expr("t'")).toEqual({ kind: 'inverse', of: name('t') });
		expect(expr("(R U)'")).toEqual({ kind: 'inverse', of: seq(move('R'), move('U')) });
	});

	it('repeats a group with a number straight after it', () => {
		expect(expr("(R U R' U')3")).toEqual({
			kind: 'repeat',
			of: seq(move('R'), move('U'), move('R', 3), move('U', 3)),
			times: 3
		});
		expect(expr("(R U)3'")).toEqual({
			kind: 'inverse',
			of: { kind: 'repeat', of: seq(move('R'), move('U')), times: 3 }
		});
	});

	it('reads conjugates, nested and inverted', () => {
		expect(expr('R<U>')).toEqual({ kind: 'conjugate', wrapper: move('R'), body: move('U') });
		expect(expr("B'<U'<(R2 U2)3>>")).toEqual({
			kind: 'conjugate',
			wrapper: move('B', 3),
			body: {
				kind: 'conjugate',
				wrapper: move('U', 3),
				body: { kind: 'repeat', of: seq(move('R', 2), move('U', 2)), times: 3 }
			}
		});
		expect(expr("F<R U>'")).toEqual({
			kind: 'inverse',
			of: { kind: 'conjugate', wrapper: move('F'), body: seq(move('R'), move('U')) }
		});
		expect(expr('y<insertRight>')).toEqual({
			kind: 'conjugate',
			wrapper: move('y'),
			body: name('insertRight')
		});
	});

	it('reads calls, with arguments separated by commas', () => {
		expect(expr('commutator(R, U)')).toEqual({
			kind: 'call',
			module: null,
			name: 'commutator',
			args: [move('R'), move('U')]
		});
		expect(expr('reflect(insertRight, M)')).toEqual({
			kind: 'call',
			module: null,
			name: 'reflect',
			args: [name('insertRight'), move('M')]
		});
		expect(expr("show(x) R' show(x')")).toEqual(
			seq({ kind: 'call', module: null, name: 'show', args: [move('x')] }, move('R', 3), {
				kind: 'call',
				module: null,
				name: 'show',
				args: [move('x', 3)]
			})
		);
	});

	it("reads a module's names", () => {
		expect(expr("cfop.sune cfop.sune'")).toEqual(
			seq(name('sune', 'cfop'), { kind: 'inverse', of: name('sune', 'cfop') })
		);
	});

	it('runs a sequence on over several lines', () => {
		expect(expr("R U\n    R' U'  # comment\n    R")).toEqual(
			seq(move('R'), move('U'), move('R', 3), move('U', 3), move('R'))
		);
	});
});

describe('cycles and patterns', () => {
	it('reads cycles, twisted cycles, and the identity', () => {
		expect(expr('()')).toEqual({ kind: 'identity' });
		expect(expr('(uf ur ub)')).toEqual({ kind: 'cycle', places: ['uf', 'ur', 'ub'], twist: 0 });
		expect(expr('(urf)+ (dfr)-')).toEqual(
			seq(
				{ kind: 'cycle', places: ['urf'], twist: 1 },
				{ kind: 'cycle', places: ['dfr'], twist: 2 }
			)
		);
		expect(expr('(u f d b)')).toEqual({ kind: 'cycle', places: ['u', 'f', 'd', 'b'], twist: 0 });
	});

	it('reads patterns: colors, wildcards, not, any rotation', () => {
		expect(expr('/u_!f/')).toEqual({
			kind: 'pattern',
			cells: [{ kind: 'color', face: 'u' }, { kind: 'any' }, { kind: 'not', face: 'f' }],
			anyRotation: false
		});
		expect(expr('/df/r')).toEqual({
			kind: 'pattern',
			cells: [
				{ kind: 'color', face: 'd' },
				{ kind: 'color', face: 'f' }
			],
			anyRotation: true
		});
	});

	it('reads places as locations', () => {
		expect(expr('uf rfu u')).toEqual(seq(place('uf'), place('rfu'), place('u')));
	});
});

describe('conditions', () => {
	it('reads is and is not', () => {
		expect(cond('uf is /df/')).toEqual({
			kind: 'is',
			place: place('uf'),
			pattern: {
				kind: 'pattern',
				cells: [
					{ kind: 'color', face: 'd' },
					{ kind: 'color', face: 'f' }
				],
				anyRotation: false
			},
			negated: false
		});
		expect((cond('uf is not p') as { negated: boolean }).negated).toBe(true);
	});

	it('gives and precedence over or, and not over both', () => {
		// (Not b, d, f, l, r, or u: those are places.)
		const a = { kind: 'test', value: name('p') };
		const b = { kind: 'test', value: name('q') };
		const c = { kind: 'test', value: name('s') };
		expect(cond('p and q or s')).toEqual({
			kind: 'or',
			items: [{ kind: 'and', items: [a, b] }, c]
		});
		expect(cond('not p and q')).toEqual({ kind: 'and', items: [{ kind: 'not', of: a }, b] });
		expect(cond('p and (q or s)')).toEqual({
			kind: 'and',
			items: [a, { kind: 'or', items: [b, c] }]
		});
	});

	it('reads calls as conditions, with a list of places as one argument', () => {
		expect(cond('solved(df dr db dl)')).toEqual({
			kind: 'test',
			value: {
				kind: 'call',
				module: null,
				name: 'solved',
				args: [seq(place('df'), place('dr'), place('db'), place('dl'))]
			}
		});
	});

	it('reads has with several cycles', () => {
		expect(cond('positions(cube) has (ufl urf) (ulb ubr)')).toEqual({
			kind: 'has',
			subject: { kind: 'call', module: null, name: 'positions', args: [name('cube')] },
			cycles: [
				{ kind: 'cycle', places: ['ufl', 'urf'], twist: 0 },
				{ kind: 'cycle', places: ['ulb', 'ubr'], twist: 0 }
			]
		});
	});

	it('reads ==', () => {
		expect(cond("sexy == sexy''")).toEqual({
			kind: 'equals',
			left: name('sexy'),
			right: { kind: 'inverse', of: { kind: 'inverse', of: name('sexy') } }
		});
	});

	it('reads face pictures, spaced or not', () => {
		const tight = cond('face U [_!u_/uuu/_!u_]');
		const spaced = cond('face U [ _ !u _ /  u u u  / _ !u _ ]');
		expect(spaced).toEqual(tight);
		expect(tight).toMatchObject({ kind: 'face', face: 'U' });
		expect((tight as { rows: unknown[][] }).rows.map((r) => r.length)).toEqual([3, 3, 3]);
	});
});

describe('statements', () => {
	it('ends a case where the next case begins, even on the same line', () => {
		const [m] = body(`match {
			case df is p -> do F2          case fr is p -> do R<U>
			otherwise    -> ()             # already in the top layer
		}`);
		expect(m).toMatchObject({ kind: 'match', otherwise: { kind: 'nothing' } });
		const cases = (m as { cases: { action: unknown }[] }).cases;
		expect(cases).toHaveLength(2);
		expect(strip(cases[0]?.action)).toEqual({ kind: 'do', value: move('F', 2) });
		expect(strip(cases[1]?.action)).toEqual({
			kind: 'do',
			value: { kind: 'conjugate', wrapper: move('R'), body: move('U') }
		});
	});

	it('reads a condition over several lines', () => {
		const [m] = body(`match {
			case urf is /urf/r and ubr is /ulb/r
			    -> do t cycleCorners
		}`);
		expect(m).toMatchObject({ cases: [{ cond: { kind: 'and' } }] });
	});

	it('reads search with generators and else', () => {
		const [s] = body(`search D* as t { case df is /uf/ -> do t F2 }
			else search y* U* as t { case uf is /uf/ -> do t } `);
		expect(strip(s)).toMatchObject({
			kind: 'search',
			generators: [move('D')],
			as: 't',
			otherwise: null,
			else: { kind: 'search', generators: [move('y'), move('U')], else: null }
		});
	});

	it('reads each, until goal, if … else if … else', () => {
		const [e, u, i] = body(`
			each y { do R }
			until goal max 2 { do U }
			if a { do R } else if b { do U } else { do F }`);
		expect(strip(e)).toEqual({
			kind: 'each',
			turn: move('y'),
			body: [{ kind: 'do', value: move('R') }]
		});
		expect(strip(u)).toMatchObject({ kind: 'until', cond: { kind: 'goal' }, max: 2 });
		expect(strip(i)).toMatchObject({
			kind: 'if',
			else: [{ kind: 'if', else: [{ kind: 'do', value: move('F') }] }]
		});
	});

	it('reads algos in every form', () => {
		const file = parseRubikon(`
			algo lift(p: Pattern) "Lift a piece to the top" { do R }
			algo main "The Basic Modern Solution" goal solved(cube) {
				algo "First Face" goal solved(layer(D)) { }
				algo { }
			}`);
		const [lift, main] = file.defs as Algo[];
		expect(lift).toMatchObject({
			name: 'lift',
			params: [{ name: 'p', type: { name: 'Pattern', arg: null } }],
			description: 'Lift a piece to the top',
			goal: null
		});
		expect(main).toMatchObject({ name: 'main', params: null, goal: { kind: 'test' } });
		expect(main?.body).toMatchObject([
			{ kind: 'algo', name: null, description: 'First Face' },
			{ kind: 'algo', name: null, description: null, goal: null }
		]);
	});

	it('reads typed functions and lets', () => {
		const file = parseRubikon(`
			fun g(p: Pattern, places: Set(Location)): Moves { return R U }
			let t: Moves = R`);
		expect(strip(file.defs)).toEqual([
			{
				kind: 'fun',
				name: 'g',
				params: [
					{ name: 'p', type: { name: 'Pattern', arg: null } },
					{ name: 'places', type: { name: 'Set', arg: 'Location' } }
				],
				result: { name: 'Moves', arg: null },
				body: [{ kind: 'return', value: seq(move('R'), move('U')) }]
			},
			{ kind: 'let', name: 't', type: { name: 'Moves', arg: null }, value: move('R') }
		]);
	});

	it('reads imports', () => {
		const file = parseRubikon(`
			from cfop import sexy, sune as mySune
			import cfop as c
			let v = mySune`);
		expect(strip(file.imports)).toEqual([
			{
				kind: 'from',
				module: 'cfop',
				names: [
					{ name: 'sexy', alias: null },
					{ name: 'sune', alias: 'mySune' }
				]
			},
			{ kind: 'import', module: 'cfop', alias: 'c' }
		]);
	});

	it('records where each statement starts', () => {
		const file = parseRubikon('\n\n  let v = R');
		expect(file.defs[0]?.loc).toEqual({ line: 3, column: 3 });
	});
});

describe('errors', () => {
	it('rejects a space before a repeat', () => {
		expect(syntaxError('let v = (R U) 3').line).toBe(1);
	});

	it('names the clockwise spelling of a corner', () => {
		expect(syntaxError('let v = (ufr)').message).toContain('corners are named clockwise: urf');
	});

	it('rejects places that are not places', () => {
		expect(syntaxError('let v = (ub uf ud)').message).toContain('Not a location: ud');
	});

	it('rejects names that are keywords, moves, or face letters only', () => {
		for (const source of ['let case = R', 'let x = R', 'let fur = R']) {
			expect(() => parseRubikon(source), source).toThrow(RubikonSyntaxError);
		}
	});

	it('needs spaces between moves', () => {
		expect(() => parseRubikon("let v = RUR'U'")).toThrow(RubikonSyntaxError);
	});

	it('needs three rows of three in a face picture', () => {
		expect(syntaxError('algo goal face U [uuu / uuu] { }').message).toContain(
			'three rows of three'
		);
	});

	it('gives the line and column', () => {
		const e = syntaxError('let a = R\nlet w = R U )');
		expect([e.line, e.column]).toEqual([2, 13]);
	});
});

describe('the drafts', () => {
	function algo(file: RubikonFile, n: string): Algo {
		const found = file.defs.find((d): d is Algo => d.kind === 'algo' && d.name === n);
		if (found === undefined) {
			throw new Error(`no algo ${n}`);
		}
		return found;
	}

	function lets(statements: readonly Statement[]): string[] {
		return statements.filter((s): s is Let => s.kind === 'let').map((s) => s.name);
	}

	it('parses cfop.rbk: twelve sequences', () => {
		const file = parseRubikon(cfopSource);
		expect(lets(file.defs)).toEqual([
			'sexy',
			'sledgehammer',
			'sune',
			'antisune',
			'niklas',
			'aPerm',
			'uPermA',
			'uPermB',
			'hPerm',
			'zPerm',
			'tPerm',
			'jPerm'
		]);
	});

	it('parses basic.rbk: an import, lift, and main with its stages', () => {
		const file = parseRubikon(basicSource);
		expect(strip(file.imports)).toEqual([
			{
				kind: 'from',
				module: 'cfop',
				names: [
					{ name: 'sexy', alias: null },
					{ name: 'sune', alias: null }
				]
			}
		]);
		expect(algo(file, 'lift').params).toHaveLength(1);
		const main = algo(file, 'main');
		expect(main.description).toBe('The Basic Modern Solution');
		expect(lets(main.body)).toContain('insertRight');
		const stages = main.body.filter((s): s is Algo => s.kind === 'algo').map((s) => s.description);
		expect(stages).toEqual([
			'First Face',
			'Middle',
			'Top Cross',
			'Top Edges',
			'Top Corners',
			'Twist Corners'
		]);
	});

	it('parses singmaster.rbk', () => {
		const main = algo(parseRubikon(singmasterSource), 'main');
		const stages = main.body.filter((s): s is Algo => s.kind === 'algo');
		expect(stages).toHaveLength(7);
	});

	it('makes plain JSON', () => {
		const file = parseRubikon(basicSource);
		expect(JSON.parse(JSON.stringify(file))).toEqual(file);
	});
});

// Keep the imported types in use for the type checker.
export type { Cond, Expr };
