import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatTaggedMoves } from './moves';
import { ProgramError, evaluateMovesLine, evaluateProgram, playEvents } from './playground';

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
		expect(scope.has('sune')).toBe(true);
		expect(scope.has('topCross')).toBe(true);
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
