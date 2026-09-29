import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRubikon } from './parse';
import type { Algo, Cond, RubikonFile, Statement } from './ast';
import type { RunEvent } from './events';
import { evaluateCondition } from './conditions';
import { engineMoves, evaluateMoves, type Moves } from './moves';
import {
	evaluateLets,
	evaluateModule,
	physicalMoves,
	renameMove,
	run,
	runMain,
	RubikonRuntimeError,
	searchCandidates,
	type RunOptions,
	type RunResult
} from './runtime';
import { RubikonError, type Env } from './values';
import { Permutation } from '../cube/permutation';
import {
	applyMoves,
	FACES,
	formatMoves,
	parseMoves,
	perm,
	permutationOf,
	type Move
} from '../cube/moves';
import { MoveList } from '../cube/move-list';
import { Beginner } from '../cube/beginner';
import type { MoveName, Turns } from '../cube/types';

const SOLVED = Permutation.identity();

function after(moves: string): Permutation {
	return permutationOf(parseMoves(moves));
}

// The condition `algo goal <source> { }` has.
function condition(source: string): Cond {
	const def = parseRubikon(`algo goal ${source} { }`).defs[0];
	if (def?.kind !== 'algo' || def.goal === null) {
		throw new Error(`No goal: ${source}`);
	}
	return def.goal;
}

function rbk(name: string): RubikonFile {
	return parseRubikon(
		readFileSync(new URL(`../../../rubikon/${name}.rbk`, import.meta.url), 'utf8')
	);
}

const cfopFile = rbk('cfop');
const basicFile = rbk('basic');
const MODULES = new Map([['cfop', cfopFile]]);

// Run a file (its algo main) on a cube.
function runFile(source: string, state = SOLVED, options?: RunOptions): RunResult {
	return runMain(parseRubikon(source), state, undefined, MODULES, options);
}

// Run `algo main { <body> }`, after other definitions.
function runBody(body: string, state = SOLVED, defs = '', options?: RunOptions): RunResult {
	return runFile(`${defs}\nalgo main { ${body} }`, state, options);
}

// Every move made, as written (frame changes included).
function made(result: RunResult): string {
	return formatMoves(result.events.flatMap((e) => (e.kind === 'move' ? [e.move.move] : [])));
}

// The run's events, briefly: "enter main", "R", "y (frame)", …
function brief(events: readonly RunEvent[]): string[] {
	return events.map((e) => {
		switch (e.kind) {
			case 'move':
				return formatMoves([e.move.move]) + (e.move.visible ? '' : ' (frame)');
			case 'enter':
			case 'bypass':
				return `${e.kind} ${e.description ?? e.name ?? '?'}`;
			case 'leave':
				return 'leave';
			case 'trace':
				return `trace ${e.text}`;
		}
	});
}

function runError(f: () => unknown): RubikonError {
	try {
		f();
	} catch (e) {
		if (e instanceof RubikonError) {
			return e;
		}
		throw e;
	}
	throw new Error('no error');
}

function random(seed: number): () => number {
	return (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function pick<T>(items: readonly T[], r: number): T {
	const item = items[Math.floor(r * items.length)];
	if (item === undefined) {
		throw new Error(`No item at ${r}`);
	}
	return item;
}

const TURNS: readonly Turns[] = [1, 2, 3];

function randomMoves(rand: () => number, names: readonly MoveName[], length: number): Move[] {
	return Array.from({ length }, (): Move => ({
		name: pick(names, rand()),
		turns: pick(TURNS, rand())
	}));
}

describe('statements', () => {
	it('lets and does moves', () => {
		const result = runBody("let t = R U  do t t'  do F2");
		expect(made(result)).toBe("R U U' R' F2");
		expect(result.state.equals(after('F2'))).toBe(true);
	});

	it('binds values of every kind with let', () => {
		const result = runBody(`
			let p = /df/r
			let here = uf
			let c = (uf ur ub)
			let bottom = df dr db dl
			let ok = solved(bottom)
			trace("{p} {here} {c} {bottom} {ok} {cube}")`);
		expect(brief(result.events)).toContain('trace /df/r uf (uf ur ub) df dr db dl true ()');
	});

	it('runs algos with parameters', () => {
		const defs = `algo lift(p: Pattern) "Lift" {
			match {
				case df is p -> do F2
				case dr is p -> do R2
				otherwise -> ()
			}
		}`;
		expect(made(runBody('do lift(/df/r)', SOLVED, defs))).toBe('F2');
		expect(made(runBody('do lift(/dr/r)', SOLVED, defs))).toBe('R2');
		expect(made(runBody('do lift(/ur/)', SOLVED, defs))).toBe('');
		expect(brief(runBody('do R lift(/df/r) U', SOLVED, defs).events)).toEqual([
			'enter main',
			'R',
			'enter Lift',
			'F2',
			'leave',
			'U',
			'leave'
		]);
		expect(runError(() => runBody('do lift(uf)', SOLVED, defs)).message).toBe(
			'8:21: p should be Pattern, not a location'
		);
		expect(runError(() => runBody('do lift', SOLVED, defs)).message).toMatch(
			/lift takes 1 argument, not 0/
		);
	});

	it('does the first case that holds, or otherwise', () => {
		const match = `match {
			case uf is /ur/ -> do U
			case solved(uf) -> do R
			case solved(uf) -> do L
			otherwise -> do D
		}`;
		expect(made(runBody(match))).toBe('R');
		expect(made(runBody(match, after('U')))).toBe('U');
		expect(made(runBody(match, after('F')))).toBe('D');
		expect(made(runBody('match { case solved(uf) -> () }'))).toBe('');
	});

	it('stops when no case holds and there is no otherwise', () => {
		const error = runError(() => runBody('match { case uf is /ur/ -> do U }'));
		expect(error).toBeInstanceOf(RubikonRuntimeError);
		expect(error.message).toBe('2:13: No case matches, and there is no otherwise');
	});

	it('runs if, else if, and else', () => {
		const source = 'if solved(uf) { do R } else if solved(ur) { do U } else { do F }';
		expect(made(runBody(source))).toBe('R');
		expect(made(runBody(source, after('F')))).toBe('U');
		expect(made(runBody(source, after('F R')))).toBe('F');
	});

	it('runs each four times, turning after each pass', () => {
		// A face turn really turns.
		expect(made(runBody('each U { do R }'))).toBe('R U R U R U R U');
		// A whole cube turn changes the frame: each pass sees another side.
		const result = runBody("each y { if not solved(fr) { do R U R' } }", after('U'));
		expect(brief(result.events).filter((e) => e.endsWith('(frame)'))).toHaveLength(4);
		expect(runError(() => runBody('each U2 { }')).message).toMatch(/each takes a quarter turn/);
	});

	it('tests until before each pass, and stops when it holds', () => {
		expect(made(runBody('until solved(uf ur) max 3 { do U }', after('U')))).toBe('U U U');
		expect(made(runBody('until solved(uf) max 3 { do U }'))).toBe('');
		const error = runError(() => runBody('until solved(uf) max 2 { do U }', after('U')));
		expect(error.message).toBe('2:13: Still not true after 2 passes (until … max 2)');
	});

	it('runs until goal to the algo’s goal', () => {
		const result = runBody(
			'algo "Top" goal solved(uf ur ub ul) { until goal max 4 { do U } }',
			after('U')
		);
		expect(made(result)).toBe('U U U');
		expect(runError(() => runBody('until goal max 1 { }')).message).toMatch(/without a goal/);
	});
});

describe('search', () => {
	const turns = (source: string): string[] => {
		const file = parseRubikon(`algo main { search ${source} as t { } }`);
		const main = file.defs[0] as Algo;
		const s = main.body[0];
		if (s?.kind !== 'search') {
			throw new Error('no search');
		}
		const generators = s.generators.flatMap((g) => evaluateMoves(g, new Map()));
		return searchCandidates(generators).map((c) => formatMoves(engineMoves(c)) || '()');
	};

	it('tries the fewest turns first', () => {
		expect(turns('U*')).toEqual(['()', 'U', "U'", 'U2']);
		expect(turns("U'*")).toEqual(['()', 'U', "U'", 'U2']);
		expect(turns('U2*')).toEqual(['()', 'U2']);
		const both = turns('y* U*');
		expect(both.slice(0, 8)).toEqual(['()', 'U', "U'", 'U2', 'y', "y'", 'y2', 'y U']);
		expect(both).toHaveLength(16);
	});

	it('names the turns found, and makes them only where written', () => {
		const search = "search U* as t { case solved(uf ur ub ul) -> do t F t' }";
		// U' is found before U2 or U: the fewest quarter turns, clockwise first.
		expect(made(runBody(search, after('U')))).toBe("U' F U");
		expect(made(runBody(search, after('U2')))).toBe('U2 F U2');
		expect(made(runBody(search))).toBe('F');
	});

	it('tries else search, then otherwise (with no turns)', () => {
		const source = `search U* as t { case solved(df) -> do t }
			else search D* as t { case solved(df dr) -> do t R }`;
		expect(made(runBody(source, after('D')))).toBe("D' R");
		const other = 'search U* as t { case uf is /df/ -> do t  otherwise -> do t L }';
		expect(made(runBody(other))).toBe('L');
		const error = runError(() => runBody('search U* as t { case uf is /df/ -> do t }'));
		expect(error.message).toBe('2:13: Search found nothing, and there is no otherwise');
	});

	it('tests cases on the cube after the candidate turns, with cube and funs', () => {
		const defs = 'fun topDone(): Bool { return solved(uf ur ub ul) }';
		const source = 'search U* as t { case topDone() -> do t }';
		expect(made(runBody(source, after('U'), defs))).toBe("U'");
		expect(made(runBody('search U* as t { case cube == () -> do t }', after('U2')))).toBe('U2');
	});

	it('searches whole cube turns as frame changes', () => {
		// After F, the top pieces at the back are untouched: a y turns two of
		// them to the right.
		const result = runBody(
			'search y* as t { case urf is /urf/ and ur is /ur/ -> do t }',
			after('F')
		);
		expect(brief(result.events)).toEqual(['enter main', 'y (frame)', 'leave']);
	});
});

describe('fun', () => {
	it('computes values with return', () => {
		const defs = `fun twice(m: Moves): Moves { return m m }
			fun bottom(): Set(Location) { let bot = df dr db dl  return bot }`;
		expect(made(runBody('do twice(R U)', SOLVED, defs))).toBe('R U R U');
		expect(made(runBody('if solved(bottom()) { do F }', SOLVED, defs))).toBe('F');
		expect(made(runBody('fun inner(): Moves { return R } do inner()'))).toBe('R');
	});

	it('never moves the cube', () => {
		expect(runError(() => runBody('fun g(): Moves { do R  return R } do g()')).message).toMatch(
			/A fun cannot move the cube/
		);
		expect(runError(() => runBody('fun g(): Moves { let m = R } do g()')).message).toMatch(
			/g ended without a return/
		);
		expect(runError(() => runBody('fun g(): Bool { return R } if g() { }')).message).toMatch(
			/g's result should be Bool, not moves/
		);
		expect(runError(() => runBody('return R')).message).toMatch(/return is only for a fun/);
	});
});

describe('algos and goals', () => {
	it('enters and leaves stages, nested, and bypasses goals that hold', () => {
		const result = runBody(
			`algo "Outer" {
				algo "Done" goal solved(uf) { do R }
				algo "Inner" goal solved(dr) { do R' }
			}`,
			after('R')
		);
		expect(brief(result.events)).toEqual([
			'enter main',
			'enter Outer',
			'bypass Done',
			'enter Inner',
			"R'",
			'leave',
			'leave',
			'leave'
		]);
		const enter = result.events.find((e) => e.kind === 'enter' && e.description === 'Inner');
		expect(enter).toMatchObject({ name: null, loc: { line: 4, column: 5 } });
	});

	it('stops when a goal isn’t reached', () => {
		const error = runError(() => runBody('algo "Twist" goal solved(uf) { do F }', after('U')));
		expect(error).toBeInstanceOf(RubikonRuntimeError);
		expect(error.message).toBe('2:31: Goal not reached: Twist');
	});

	it('keeps goals: a later algo must not break them', () => {
		const source = `
			algo "Edge" goal solved(uf) { }
			algo "Break" { do F }`;
		expect(runError(() => runBody(source)).message).toBe('4:4: Break broke the goal of Edge');
		// Broken along the way, but put back by the end: fine.
		expect(made(runBody(`${source.replace('do F', "do F F'")}`))).toBe("F F'");
	});

	it('reads goals in the frame their algo ran in', () => {
		// After B, fr is solved; after a y, the place now at the front right
		// (the old back right) isn't, but the goal still holds where it was set.
		const source = `
			algo "Slot" goal solved(fr) { }
			do y
			algo "Later" { }`;
		const result = runBody(source, after('B'));
		expect(brief(result.events)).toContain('bypass Slot');
		expect(evaluateCondition(condition('solved(fr)'), result.state)).toBe(false);
	});

	it('refuses an algo with parameters inside another', () => {
		expect(runError(() => runBody('algo inner(p: Pattern) { }')).message).toMatch(
			/defined at a file's top level/
		);
	});
});

describe('whole cube turns', () => {
	it('makes frame changes, renamed in the moves shown', () => {
		const result = runBody("do y R y'");
		expect(brief(result.events)).toEqual(['enter main', 'y (frame)', 'R', "y' (frame)", 'leave']);
		// Turned by y, the right face is the one that was at the back.
		expect(formatMoves(physicalMoves(result.events))).toBe('B');
		expect(result.state.equals(after('B'))).toBe(true);
	});

	it('shows turns tagged with show()', () => {
		const result = runBody('do show(y) R');
		expect(brief(result.events)).toEqual(['enter main', 'y', 'R', 'leave']);
		expect(formatMoves(physicalMoves(result.events))).toBe('y R');
	});

	it('renames every move through every frame', () => {
		for (const frame of ['x', 'y', 'z', "x y'", 'z2 x']) {
			const f = permutationOf(parseMoves(frame));
			for (const name of ['U', 'R', 'F', 'M', 'E', 'S'] as const) {
				const move: Move = { name, turns: 1 };
				const renamed = renameMove(f, move);
				const expected = applyMoves(applyMoves(SOLVED, parseMoves(frame)), [move]);
				// The state in the turned frame, read back in the first.
				const back = f.compose(expected).compose(f.inverse());
				expect(perm(renamed.name, renamed.turns).equals(back), `${frame} ${name}`).toBe(true);
			}
		}
	});
});

describe('trace', () => {
	it('prints values into the event stream, in order', () => {
		const result = runBody('do R  trace("after R: {cube}, {{uf}} is {uf}, {solved(uf)}")  do U');
		expect(brief(result.events)).toEqual([
			'enter main',
			'R',
			`trace after R: ${after('R').toString()}, {uf} is uf, true`,
			'U',
			'leave'
		]);
	});
});

describe('errors and limits', () => {
	it('reports evaluation errors with their position', () => {
		const error = runError(() => runBody('do nope'));
		expect(error.message).toBe('2:16: Unknown name: nope');
		expect(runError(() => runBody('do (uf ur ub)')).message).toMatch(/Only moves can be played/);
		expect(runError(() => runBody('let a = R  let a = U')).message).toMatch(/Already defined: a/);
		expect(runError(() => runBody('let cube = R')).message).toMatch(/cube is the cube itself/);
	});

	it('stops a run that makes too many moves or steps', () => {
		const moves = runError(() => runBody('do (R)20', SOLVED, '', { maxMoves: 10 }));
		expect(moves.message).toBe('2:13: Too many moves (more than 10)');
		const steps = runError(() =>
			runBody('each y { each y { each y { } } }', SOLVED, '', { maxSteps: 10 })
		);
		expect(steps.message).toMatch(/Too many steps \(more than 10\)/);
		const deep = runError(() => runFile('algo loop { do loop }\nalgo main { do loop }'));
		expect(deep.message).toMatch(/Algos nested too deep/);
	});

	it('needs main, and its modules', () => {
		expect(runError(() => runFile('algo other { }')).message).toBe('1:1: No algo main to run');
		expect(runError(() => runFile('import nope\nalgo main { }')).message).toBe(
			'1:1: Unknown module: nope'
		);
		const one = parseRubikon('import two\nlet r1 = R');
		const two = parseRubikon('import one\nlet u1 = U');
		const modules = new Map([
			['one', one],
			['two', two]
		]);
		const error = runError(() =>
			runMain(parseRubikon('import one\nalgo main { }'), SOLVED, undefined, modules)
		);
		expect(error.message).toBe('1:1: Circular import: one');
	});

	it('imports names and runs imported algos', () => {
		const lib = parseRubikon('let sexy = commutator(R, U)\nalgo twice "Twice" { do sexy sexy }');
		const result = runMain(
			parseRubikon("import lib\nfrom lib import sexy as s\nalgo main { do s' lib.twice }"),
			SOLVED,
			undefined,
			new Map([['lib', lib]])
		);
		expect(made(result)).toBe("U R U' R' R U R' U' R U R' U'");
		expect(brief(result.events)).toContain('enter Twice');
	});
});

// --- basic.rbk ---

// basic.rbk's main, its stages by description, and the names they use.
const cfop = evaluateModule(cfopFile);
const basicTop = evaluateModule(basicFile, new Map([['cfop', cfop.exports]]));
const main = basicTop.scope.get('main');
if (main?.kind !== 'algo') {
	throw new Error('basic.rbk has no main');
}
const basicEnv: Env = evaluateLets(main.def.body, basicTop.scope);

function stages(body: readonly Statement[]): Map<string, Algo> {
	const found = new Map<string, Algo>();
	for (const s of body) {
		if (s.kind === 'algo') {
			found.set(s.description ?? '', s);
			for (const [name, inner] of stages(s.body)) {
				found.set(name, inner);
			}
		}
	}
	return found;
}

const STAGES = stages(main.def.body);

function stage(name: string): Algo {
	const found = STAGES.get(name);
	if (found === undefined) {
		throw new Error(`No stage ${name}`);
	}
	return found;
}

function goalHolds(name: string, state: Permutation): boolean {
	const goal = stage(name).goal;
	return goal !== null && evaluateCondition(goal, state, basicEnv);
}

const ORDER = ['First Face', 'Middle', 'Top Cross', 'Top Edges', 'Top Corners', 'Twist Corners'];

function scrambles(seed: number, count: number): Permutation[] {
	const rand = random(seed);
	return Array.from({ length: count }, () => permutationOf(randomMoves(rand, FACES, 30)));
}

// A last layer scramble: the first two layers solved.
function lastLayerScrambles(seed: number, count: number): Permutation[] {
	const rand = random(seed);
	const pieces: Moves[] = ['sune', 'tPerm', 'uPermA'].map((n) => {
		const value = cfop.exports.get(n);
		return value?.kind === 'moves' ? value.moves : [];
	});
	return Array.from({ length: count }, () => {
		let state = SOLVED;
		for (let i = 0; i < 12; i++) {
			state = applyMoves(state, [
				...parseMoves(pick(['U', 'U2', "U'"], rand())),
				...engineMoves(pick(pieces, rand()))
			]);
		}
		return state;
	});
}

describe('basic.rbk, stage by stage', () => {
	it('has the stages of the method', () => {
		expect([...STAGES.keys()]).toEqual([
			'First Face',
			'Bottom Edges',
			'Bottom Corners',
			'Middle',
			'Top Cross',
			'Top Edges',
			'Top Corners',
			'Twist Corners'
		]);
	});

	it('Bottom Edges, then Bottom Corners, from scrambles', () => {
		for (const start of scrambles(1, 30)) {
			const edges = run(stage('Bottom Edges'), start, basicEnv);
			expect(goalHolds('Bottom Edges', edges.state)).toBe(true);
			const corners = run(stage('Bottom Corners'), edges.state, basicEnv);
			expect(goalHolds('Bottom Corners', corners.state)).toBe(true);
			expect(goalHolds('Bottom Edges', corners.state)).toBe(true);
		}
	});

	it('each stage from states where the earlier goals hold', () => {
		for (const start of scrambles(2, 30)) {
			let state = start;
			ORDER.forEach((name, i) => {
				state = run(stage(name), state, basicEnv).state;
				for (const earlier of ORDER.slice(0, i + 1)) {
					expect(goalHolds(earlier, state), `${name}, then ${earlier}`).toBe(true);
				}
			});
		}
	});

	it('the top stages from last layer scrambles', () => {
		for (const start of lastLayerScrambles(3, 50)) {
			expect(goalHolds('Middle', start) && goalHolds('First Face', start)).toBe(true);
			let state = start;
			for (const name of ORDER.slice(2)) {
				state = run(stage(name), state, basicEnv).state;
				expect(goalHolds(name, state), name).toBe(true);
			}
			expect(evaluateCondition(condition('solved(cube)'), state)).toBe(true);
		}
	});
});

// Face turns, as the move history counts them: a half turn is one, whole
// cube turns don't count, and moves that cancel don't count.
function faceTurns(moves: Move[]): number {
	const list = new MoveList();
	list.add(moves);
	return list.history()[0]?.faceTurns ?? 0;
}

describe('basic.rbk, end to end', () => {
	it('solves a solved cube with no moves', () => {
		const result = runMain(basicFile, SOLVED, undefined, MODULES);
		expect(brief(result.events)).toEqual(['bypass The Basic Modern Solution']);
	});

	it('solves random scrambles, like the TypeScript solver', () => {
		const starts = scrambles(1980, 100);
		let rubikon = 0;
		let typescript = 0;
		for (const [i, start] of starts.entries()) {
			const events: RunEvent[] = [];
			const result = runMain(basicFile, start, (e) => events.push(e), MODULES);
			expect(result.events).toEqual(events);
			const shown = physicalMoves(result.events);
			// The moves shown solve the cube (as it's shown, never turned).
			expect(applyMoves(start, shown).toString(), `scramble ${i}`).toBe('()');
			rubikon += faceTurns(shown);
			const list = new MoveList();
			new Beginner(list).solve(start);
			typescript += faceTurns(list.moves);
		}
		console.log(
			`basic.rbk: 100 scrambles, ${rubikon / 100} face turns on average; ` +
				`TypeScript Basic: ${typescript / 100}`
		);
		expect(rubikon).toBeGreaterThan(0);
	});
});
