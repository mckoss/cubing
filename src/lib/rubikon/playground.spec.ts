import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MoveList, type HistoryItem } from '../cube/move-list';
import { applyMoves, formatMoves, parseMoves, permutationOf } from '../cube/moves';
import { Permutation } from '../cube/permutation';
import { formatTaggedMoves } from './moves';
import {
	ProgramError,
	evaluateMovesLine,
	evaluateProgram,
	playEvents,
	runAlgo,
	runProgram,
	type EvaluatedProgram
} from './playground';
import { RunRecorder } from './record';

const read = (name: string): string =>
	readFileSync(new URL(`../../../rubikon/${name}.rbk`, import.meta.url), 'utf8');

const LIBRARY: Record<string, string> = { cfop: read('cfop'), basic: read('basic') };
const find = (name: string): string | undefined => LIBRARY[name];

// The error a function throws.
function errorOf(f: () => unknown): ProgramError {
	try {
		f();
	} catch (e) {
		if (e instanceof ProgramError) return e;
		throw e;
	}
	throw new Error('No error');
}

describe('evaluateProgram', () => {
	it('evaluates top-level lets', () => {
		const { lets } = evaluateProgram("let sexy = R U R' U'\nlet twice = (sexy)2", find);
		expect(lets.map((l) => [l.name, formatTaggedMoves(l.moves), l.loc.line])).toEqual([
			['sexy', "R U R' U'", 1],
			['twice', "R U R' U' R U R' U'", 2]
		]);
	});

	it('evaluates the lets in algos, with the algos they are in', () => {
		const { lets, scope } = evaluateProgram(read('basic'), find);
		const insertRight = lets.find((l) => l.name === 'insertRight');
		expect(insertRight?.path).toEqual(['main']);
		expect(formatTaggedMoves(insertRight?.moves ?? [])).toBe("U R U' R' U' F' U F");
		// Imports and algo lets can be played.
		expect(scope.get('sune')?.kind).toBe('moves');
		expect(scope.get('topCross')?.kind).toBe('moves');
	});

	it('imports from the library', () => {
		const { scope } = evaluateProgram('import cfop as c\nlet s = c.sune', find);
		expect(scope.get('s')).toEqual(scope.get('c.sune'));
	});

	it('reports syntax errors at their line and column', () => {
		const error = errorOf(() => evaluateProgram('let one = R U\nlet two = (R U) 3', find));
		expect([error.line, error.column, error.module]).toEqual([2, 17, null]);
	});

	it('reports evaluation errors at their line and column', () => {
		const error = errorOf(() => evaluateProgram('let one = R\n  let two = nope', find));
		expect(error.message).toBe('Unknown name: nope');
		expect(error.where).toBe('2:13');
	});

	it('reports a missing module, and errors in an imported one', () => {
		expect(errorOf(() => evaluateProgram('import nope', find)).message).toContain(
			'No program named nope'
		);
		const broken = (name: string): string | undefined =>
			({ bad: 'let first = R\nlet second = Q' })[name];
		const error = errorOf(() => evaluateProgram('import bad', broken));
		expect([error.module, error.line]).toEqual(['bad', 2]);
	});

	it('catches circular imports', () => {
		const circle = (name: string): string | undefined =>
			({ one: 'import two\nlet first = R', two: 'import one\nlet second = U' })[name];
		expect(errorOf(() => evaluateProgram('import one', circle)).message).toBe(
			'Circular import: one → two → one'
		);
	});
});

describe('evaluateMovesLine', () => {
	const { scope } = evaluateProgram(read('cfop'), find);

	it('plays moves and names', () => {
		expect(formatTaggedMoves(evaluateMovesLine('F<sexy> U2', scope))).toBe("F R U R' U' F' U2");
	});

	it('reports errors at columns of the line', () => {
		expect(errorOf(() => evaluateMovesLine('R U nope', scope)).where).toBe('1:5');
		expect(errorOf(() => evaluateMovesLine('R U (R U) 3', scope)).where).toBe('1:11');
		expect(errorOf(() => evaluateMovesLine('R\nU', scope)).message).toContain('one line');
		expect(errorOf(() => evaluateMovesLine('R algo {}', scope)).message).toContain('Only moves');
	});
});

describe('playEvents', () => {
	it('plays moves as one algo', () => {
		const loc = { line: 3, column: 1 };
		const events = playEvents('sexy', evaluateMovesLine("R U'", new Map()), loc);
		expect(events.map((e) => e.kind)).toEqual(['enter', 'move', 'move', 'leave']);
		expect(events[0]).toMatchObject({ kind: 'enter', name: 'sexy' });
	});
});

// The notes and block titles in a history, in order, nested blocks
// flattened: "{The Basic Modern Solution", "[trace: …]", …
function outline(items: HistoryItem[]): string[] {
	return items.flatMap((item) =>
		Array.isArray(item)
			? []
			: 'note' in item
				? [`[${item.note}: ${item.text}]`]
				: [`{${item.name}`, ...outline(item.items)]
	);
}

// Run a program's main on a cube, recording it; returns the move list.
function record(source: string, state: Permutation, library = find): MoveList {
	const list = new MoveList();
	const recorder = new RunRecorder(list);
	try {
		runProgram(evaluateProgram(source, library), state, recorder.listener);
	} finally {
		recorder.finish();
	}
	return list;
}

describe('runAlgo', () => {
	const paths = (program: EvaluatedProgram): string[] =>
		program.algos.map((a) => a.path.join(' › '));

	it('lists the algos without parameters, nested ones too', () => {
		const source = [
			'algo helper(p: Pattern) { algo "Inside helper" { do R } }',
			'algo main "Demo" {',
			'  algo "Stage" { algo deep { do U } }',
			'}',
			'algo other() { do F }'
		].join('\n');
		expect(paths(evaluateProgram(source, find))).toEqual([
			'main',
			'main › Stage',
			'main › Stage › deep',
			'other'
		]);
		expect(paths(evaluateProgram(read('basic'), find))).toEqual([
			'main',
			'main › First Face',
			'main › First Face › Bottom Edges',
			'main › First Face › Bottom Corners',
			'main › Middle',
			'main › Top Cross',
			'main › Top Edges',
			'main › Top Corners',
			'main › Twist Corners'
		]);
	});

	// Run the algo at a path by itself, recording it.
	function runAt(program: EvaluatedProgram, path: string, state: Permutation): MoveList {
		const algo = program.algos.find((a) => a.path.join(' › ') === path);
		if (algo === undefined) throw new Error(`No algo ${path}`);
		const list = new MoveList();
		const recorder = new RunRecorder(list);
		try {
			runAlgo(program, algo, state, recorder.listener);
		} finally {
			recorder.finish();
		}
		return list;
	}

	it("runs a nested algo by itself, with its parents' lets", () => {
		const program = evaluateProgram('algo main {\n  let s = R U\n  algo "Stage" { do s }\n}', find);
		const list = runAt(program, 'main › Stage', new Permutation());
		expect(formatMoves(list.moves)).toBe('R U');
		expect(outline(list.history()[0]?.items ?? [])).toEqual(['{Stage']);
	});

	it("runs basic's Top Cross on a last layer scramble, and bypasses it once solved", () => {
		const basic = evaluateProgram(read('basic'), find);
		// Two top edges flipped; the first two layers solved.
		const start = permutationOf(parseMoves("F R U R' U' F'"));
		const list = runAt(basic, 'main › Top Cross', start);
		expect(list.moves.length).toBeGreaterThan(0);
		expect(outline(list.history()[0]?.items ?? [])).toEqual(['{Top Cross']);
		const after = applyMoves(start, list.moves);
		expect(outline(runAt(basic, 'main › Top Cross', after).history()[0]?.items ?? [])).toEqual([
			'[bypass: Top Cross: skipped, its goal already holds]'
		]);
	});

	it('reports a goal not reached at its line', () => {
		const program = evaluateProgram('algo main {\n  algo "Fail" goal solved(df) { do F }\n}', find);
		const error = errorOf(() => runAt(program, 'main › Fail', permutationOf(parseMoves('F'))));
		expect([error.message, error.where]).toEqual(['Goal not reached: Fail', '2:20']);
	});
});

describe('runProgram', () => {
	it('says whether a program has a main', () => {
		expect(evaluateProgram(read('basic'), find).hasMain).toBe(true);
		expect(evaluateProgram(read('cfop'), find).hasMain).toBe(false);
	});

	it('runs main with the library modules it imports, solving a scramble', () => {
		const start = permutationOf(parseMoves("R U F' D2 L B' U2 R' F D' L2 B"));
		const list = record(read('basic'), start);
		expect(applyMoves(start, list.moves).isIdentity()).toBe(true);
		const [root] = list.history();
		expect(outline(root?.items ?? [])).toEqual(
			expect.arrayContaining(['{The Basic Modern Solution', '{First Face', '{Bottom Edges'])
		);
	});

	it('runs a program that imports basic, which imports cfop', () => {
		const start = permutationOf(parseMoves("F R' U2 B D"));
		const list = record('import basic\nalgo main { do basic.main }', start);
		expect(applyMoves(start, list.moves).isIdentity()).toBe(true);
	});

	it('brings trace lines and bypassed algos to the history', () => {
		const list = record(
			'algo main {\n  trace("start {cube}")\n  algo "Nothing to do" goal solved(df) { do R }\n  do U\n}',
			new Permutation()
		);
		expect(outline(list.history()[0]?.items ?? [])).toEqual([
			'{main',
			'[trace: start ()]',
			'[bypass: Nothing to do: skipped, its goal already holds]'
		]);
		expect(formatMoves(list.moves)).toBe('U');
	});

	it('reports runtime errors at their line and column', () => {
		const error = errorOf(() =>
			runProgram(evaluateProgram('algo main {\n  do R\n  do nope\n}', find), new Permutation())
		);
		expect([error.message, error.where]).toEqual(['Unknown name: nope', '3:6']);
		const noMain = errorOf(() => runProgram(evaluateProgram('let t = R', find), new Permutation()));
		expect(noMain.message).toBe('No algo main to run');
	});

	it('reports runtime errors in an imported module, in that module', () => {
		const library = (name: string): string | undefined =>
			({ lib: 'let fine = R\n\nalgo broken {\n  do fine\n  do missing\n}' })[name];
		const error = errorOf(() =>
			runProgram(
				evaluateProgram('import lib\nalgo main { do lib.broken }', library),
				new Permutation()
			)
		);
		expect([error.module, error.where, error.message]).toEqual([
			'lib',
			'lib 5:6',
			'Unknown name: missing'
		]);
	});

	it("reports runtime errors in the program itself as the program's, with imports", () => {
		const library = (name: string): string | undefined =>
			({ lib: 'let fine = R\n\nalgo broken {\n  do fine\n  do missing\n}' })[name];
		const error = errorOf(() =>
			runProgram(
				evaluateProgram('import lib\nalgo main {\n  do lib.fine\n  do nope\n}', library),
				new Permutation()
			)
		);
		expect([error.module, error.where, error.message]).toEqual([null, '4:6', 'Unknown name: nope']);
	});

	it('runs a main whose lets use a fun defined in it', () => {
		const source =
			'algo main {\n  fun twice(seq: Moves): Moves { return seq seq }\n  let a = twice(R)\n  do a\n}';
		const { lets } = evaluateProgram(source, find);
		expect(lets.map((entry) => formatTaggedMoves(entry.moves))).toEqual(['R R']);
		expect(formatMoves(record(source, new Permutation()).moves)).toBe('R R');
	});

	it('stops a program that runs forever', () => {
		const error = errorOf(() =>
			runProgram(
				evaluateProgram(
					'algo main {\n  until not solved(cube) max 1000000000 { do M2 M2 }\n}',
					find
				),
				new Permutation(),
				undefined,
				{ maxMoves: 100, maxSteps: 1000 }
			)
		);
		expect(error.message).toMatch(/Too many/);
		expect(error.line).not.toBeNull();
	});
});
