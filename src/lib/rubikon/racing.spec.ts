import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Permutation } from '../cube/permutation';
import { applyMoves, FACES, formatMoves } from '../cube/moves';
import { MoveList } from '../cube/move-list';
import { RunRecorder } from './record';
import { evaluateProgram, runProgram, ProgramError } from './playground';
import {
	RACE_COUNT,
	cubeSeed,
	mean,
	median,
	prepareRacer,
	race,
	raceScramble,
	raceScrambles,
	raceStats,
	shortHash,
	type CubeResult,
	type Racer
} from './racing';

const rbk = (name: string): string =>
	readFileSync(new URL(`../../../rubikon/${name}.rbk`, import.meta.url), 'utf8');

const BASIC: Racer = {
	kind: 'rubikon',
	name: 'basic',
	source: rbk('basic'),
	modules: { cfop: rbk('cfop') }
};

function program(source: string, name = 'test'): Racer {
	return { kind: 'rubikon', name, source, modules: {} };
}

describe('race scrambles', () => {
	it('are the same for the same seed', () => {
		expect(raceScrambles(7, 20).map(formatMoves)).toEqual(raceScrambles(7, 20).map(formatMoves));
		expect(raceScrambles(1).length).toBe(RACE_COUNT);
	});

	it('differ from seed to seed, and cube to cube', () => {
		const one = raceScrambles(1, 50).map(formatMoves);
		const two = raceScrambles(2, 50).map(formatMoves);
		expect(new Set([...one, ...two]).size).toBe(100);
	});

	it('make each cube from the seed and its index alone', () => {
		const long = raceScrambles(3, 100);
		const short = raceScrambles(3, 10);
		expect(short.map(formatMoves)).toEqual(long.slice(0, 10).map(formatMoves));
		expect(formatMoves(raceScramble(3, 57))).toBe(formatMoves(long[57] ?? []));
		expect(cubeSeed(3, 57)).toBe(cubeSeed(3, 57));
		expect(cubeSeed(3, 57)).not.toBe(cubeSeed(3, 58));
	});

	it('are 25 quarter turns of the faces, never the same face twice in a row', () => {
		for (const moves of raceScrambles(5, 100)) {
			expect(moves.length).toBe(25);
			moves.forEach((move, i) => {
				expect(FACES).toContain(move.name);
				expect([1, 3]).toContain(move.turns);
				expect(move.name).not.toBe(moves[i - 1]?.name);
			});
		}
	});

	it('are stable (changing them needs a new RACE_GENERATOR)', () => {
		expect(formatMoves(raceScramble(1, 0))).toBe(
			"D' B U R' D F B' L R' F' U F R L' R L R U' R' L' R' B L D' U'"
		);
	});
});

describe('race stats', () => {
	const solved = (moves: number, quarterTurns = moves): CubeResult => ({
		moves,
		quarterTurns,
		failure: null
	});

	it('take the median of an odd or even number of values', () => {
		expect(median([])).toBeNull();
		expect(median([4])).toBe(4);
		expect(median([1, 2, 9])).toBe(2);
		expect(median([1, 2, 3, 9])).toBe(2.5);
	});

	it('round the mean to one decimal place', () => {
		expect(mean([])).toBeNull();
		expect(mean([1, 2])).toBe(1.5);
		expect(mean([1, 1, 2])).toBe(1.3);
		expect(mean([2, 2, 3])).toBe(2.3);
	});

	it('count the solved cubes only, and list the others', () => {
		const stats = raceStats([
			solved(120, 130),
			{ moves: 3, quarterTurns: 3, failure: 'Goal not reached' },
			solved(100, 104),
			solved(110, 112),
			solved(110, 118)
		]);
		expect(stats).toEqual({
			count: 5,
			solved: 4,
			failures: [{ index: 1, reason: 'Goal not reached' }],
			best: 100,
			worst: 120,
			mean: 110,
			median: 110,
			meanQuarterTurns: 116,
			histogram: [
				[100, 1],
				[110, 2],
				[120, 1]
			]
		});
	});

	it('have no move counts when no cube is solved', () => {
		const stats = raceStats([{ moves: 0, quarterTurns: 0, failure: 'x' }]);
		expect(stats.best).toBeNull();
		expect(stats.worst).toBeNull();
		expect(stats.mean).toBeNull();
		expect(stats.median).toBeNull();
		expect(stats.histogram).toEqual([]);
	});
});

describe('racing', () => {
	it("counts moves as the move history's header does", () => {
		const evaluated = evaluateProgram(BASIC.source, (name) => BASIC.modules[name]);
		const { solve } = prepareRacer(BASIC);
		for (let i = 0; i < 5; i++) {
			const start = applyMoves(Permutation.identity(), raceScramble(9, i));
			const moveList = new MoveList();
			const recorder = new RunRecorder(moveList);
			runProgram(evaluated, start, recorder.listener);
			recorder.finish();
			const [whole] = moveList.history();
			expect(solve(start)).toEqual({
				moves: whole?.faceTurns,
				quarterTurns: whole?.quarterTurns,
				failure: null
			});
		}
	});

	it("doesn't count whole cube turns", () => {
		const { solve } = prepareRacer(program('algo main {\n  do y R show(y) U L\n}'));
		const result = solve(Permutation.identity());
		expect(result.moves).toBe(3);
		expect(result.quarterTurns).toBe(3);
		// Faces turned, so it isn't solved.
		expect(result.failure).toBe('Not solved at the end');
	});

	it('solves every cube with basic.rbk and the TypeScript solvers', () => {
		for (const racer of [
			BASIC,
			{ kind: 'typescript', id: 'basic' },
			{ kind: 'typescript', id: 'singmaster' }
		] satisfies Racer[]) {
			const result = race(racer, 11, { count: 10 });
			expect(result.stats.solved, result.name).toBe(10);
			expect(result.stats.best).toBeGreaterThan(20);
		}
	});

	it('reports every cube unsolved, with why, when the goal is never met', () => {
		const progress: number[] = [];
		const result = race(program('algo main goal solved(cube) {\n  do ()\n}\n', 'lazy'), 1, {
			count: 20,
			onProgress: (done) => progress.push(done)
		});
		expect(result.stats.solved).toBe(0);
		expect(result.stats.failures.length).toBe(20);
		expect(result.stats.failures[3]).toEqual({ index: 3, reason: '1:16 Goal not reached: main' });
		expect(progress).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
	});

	it('reports a cube left unsolved without an error', () => {
		const result = race(program('algo main {\n  do U\n}\n'), 1, { count: 3 });
		expect(result.stats.failures.map((f) => f.reason)).toEqual(
			Array(3).fill('Not solved at the end')
		);
	});

	it("reports the runtime's limits", () => {
		const result = race(program('algo main {\n  do ((R U)1000)20\n}\n'), 1, { count: 1 });
		expect(result.stats.failures[0]?.reason).toMatch(/Too many (moves|steps)/);
	});

	it("won't race a program without an algo main, or with an error", () => {
		expect(() => race(program('let a = R U'), 1, { count: 1 })).toThrow(ProgramError);
		expect(() => race(program('algo main {'), 1, { count: 1 })).toThrow(ProgramError);
	});

	it("hashes a program's source and the modules it imports", () => {
		const hash = prepareRacer(BASIC).hash;
		expect(hash).toMatch(/^[0-9a-f]{8}$/);
		expect(prepareRacer({ ...BASIC, modules: { cfop: BASIC.modules.cfop + '\n' } }).hash).not.toBe(
			hash
		);
		expect(prepareRacer({ ...BASIC, source: BASIC.source + '\n' }).hash).not.toBe(hash);
		expect(prepareRacer({ kind: 'typescript', id: 'basic' }).hash).toBeNull();
		expect(shortHash('')).toBe('811c9dc5');
	});
});
