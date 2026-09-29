// Cube Racing: a solver (a Rubikon program's `algo main`, or one of the
// simulator's TypeScript solvers) run on the same 500 random scrambles,
// with the moves it takes counted as the move history counts them.
//
// Everything here is pure: the page runs a race in a Web Worker
// (racing.worker.ts, started by races.ts), and benchmarks.spec.ts runs the
// built-in races again to check benchmarks.json.

import { Permutation } from '../cube/permutation';
import { applyMoves, randomScramble, type Move } from '../cube/moves';
import { MoveList, countTurns } from '../cube/move-list';
import { SOLVERS } from '../cube/solvers';
import { isSolved } from './conditions';
import { RunRecorder } from './record';
import { evaluateProgram, runProgram, ProgramError } from './playground';

// The version of the scramble generator.  Stored with every result: a
// result is only comparable with others made by the same generator, so
// change this whenever raceScramble() changes (and run
// `npm run build:benchmarks`).
//
// Generator 1: cube i of a race with seed s is scrambled by
// randomScramble(25, mulberry32(cubeSeed(s, i))): 25 random quarter turns
// of the faces, never the same face twice in a row (as the page's Scramble
// makes them).
export const RACE_GENERATOR = 1;

// How many cubes a race has.
export const RACE_COUNT = 500;

// The scramble's length, in quarter turns.
const SCRAMBLE_LENGTH = 25;

// A seeded random number generator (mulberry32): numbers in [0, 1).
export function mulberry32(seed: number): () => number {
	let a = seed | 0;
	return (): number => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// The seed for one cube of a race: mixed from the race's seed and the
// cube's index (a 32-bit hash), so each cube can be made by itself.
export function cubeSeed(seed: number, index: number): number {
	let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h ^ (index | 0), 0xc2b2ae35);
	h ^= h >>> 16;
	h = Math.imul(h, 0x27d4eb2f);
	h ^= h >>> 15;
	return h | 0;
}

// Cube `index` (0-based) of a race: its scramble.
export function raceScramble(seed: number, index: number): Move[] {
	return randomScramble(SCRAMBLE_LENGTH, mulberry32(cubeSeed(seed, index)));
}

// A race's scrambles, in order.
export function raceScrambles(seed: number, count = RACE_COUNT): Move[][] {
	return Array.from({ length: count }, (_, i) => raceScramble(seed, i));
}

// The TypeScript solvers, by id, as they're named in a race.
export const TYPESCRIPT_SOLVERS = {
	basic: { name: 'Basic Modern Solution (TypeScript)', solver: 'Basic Modern Solution' },
	singmaster: { name: 'Singmaster (TypeScript)', solver: 'Singmaster' }
} as const;

export type TypeScriptSolverId = keyof typeof TYPESCRIPT_SOLVERS;

export function isTypeScriptSolverId(id: string): id is TypeScriptSolverId {
	return Object.hasOwn(TYPESCRIPT_SOLVERS, id);
}

// What races: a Rubikon program (by name, with the library's programs it
// may import, by name), or a TypeScript solver.
export type Racer =
	| { kind: 'rubikon'; name: string; source: string; modules: Record<string, string> }
	| { kind: 'typescript'; id: TypeScriptSolverId };

// One cube's solve: its moves (face turns; a half turn counts once, whole
// cube turns don't count) and quarter turns, and why it wasn't solved, if
// it wasn't.
export interface CubeResult {
	moves: number;
	quarterTurns: number;
	failure: string | null;
}

// A cube that wasn't solved, and why.  index is 0-based (shown as cube
// index + 1).
export interface RaceFailure {
	index: number;
	reason: string;
}

// The numbers for a race.  The move counts are of the solved cubes only
// (null if none was solved); the mean is to one decimal place.
export interface RaceStats {
	count: number;
	solved: number;
	failures: RaceFailure[];
	best: number | null;
	worst: number | null;
	mean: number | null;
	median: number | null;
	meanQuarterTurns: number | null;
	// How many solved cubes took each number of moves: [moves, cubes],
	// fewest moves first.
	histogram: [number, number][];
}

// A race's result, as the page shows and keeps it.
export interface RaceResult {
	// The program's name, or the TypeScript solver's.
	name: string;
	kind: Racer['kind'];
	// For a program, a short hash of its source and the modules it imports
	// (so results before and after an edit can be told apart); null for a
	// TypeScript solver.
	hash: string | null;
	seed: number;
	generator: number;
	stats: RaceStats;
	// How long it took, in milliseconds, and when it was run (ISO 8601).
	ms: number;
	date: string;
	// One of the site's own benchmarks (benchmarks.json).
	builtIn?: boolean;
	// Why the race stopped before its last cube, if it did (its stats are
	// of the cubes raced).
	stopped?: string;
}

// A short hash of text (32-bit FNV-1a, as 8 hex digits).
export function shortHash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

// Solves one cube, from its start.
type SolveCube = (start: Permutation) => CubeResult;

// Why a run failed, or why a race couldn't start: a Rubikon error with
// where it is ("12:3: Goal not reached: First Face"), or any other error's
// message.
export function describeError(e: unknown): string {
	if (e instanceof ProgramError) {
		return e.where === '' ? e.message : `${e.where}: ${e.message}`;
	}
	return e instanceof Error ? e.message : String(e);
}

// Count a solve's moves, and check the cube is solved (however it's held).
function finish(start: Permutation, moveList: MoveList, failure: string | null): CubeResult {
	const { faceTurns, quarterTurns } = countTurns(moveList.moves);
	if (failure === null && !isSolved(applyMoves(start, moveList.moves))) {
		failure = 'Not solved at the end';
	}
	return { moves: faceTurns, quarterTurns, failure };
}

// Get a racer ready: a program is evaluated once (a ProgramError if it
// can't be, or has no algo main).  Returns how to solve a cube, and the
// racer's name and hash.
export function prepareRacer(racer: Racer): {
	name: string;
	hash: string | null;
	solve: SolveCube;
} {
	if (racer.kind === 'typescript') {
		const { name, solver: solverName } = TYPESCRIPT_SOLVERS[racer.id];
		const solver = SOLVERS.find((s) => s.name === solverName);
		if (solver === undefined) throw new Error(`No solver named ${solverName}`);
		return {
			name,
			hash: null,
			solve: (start): CubeResult => {
				const moveList = new MoveList();
				let failure: string | null = null;
				try {
					solver.solve(start, moveList);
				} catch (e) {
					failure = describeError(e);
				}
				return finish(start, moveList, failure);
			}
		};
	}
	// Imports come from the modules given, as the page's library gives them.
	const findModule = (name: string): string | undefined =>
		Object.hasOwn(racer.modules, name) ? racer.modules[name] : undefined;
	const program = evaluateProgram(racer.source, findModule);
	if (!program.hasMain) {
		throw new ProgramError(`${racer.name} has no algo main to race`, null, null);
	}
	const imported = [...program.modules.keys()].sort();
	const hash = shortHash(
		[racer.source, ...imported.map((name) => `${name}\n${findModule(name) ?? ''}`)].join('\n\0')
	);
	return {
		name: racer.name,
		hash,
		solve: (start): CubeResult => {
			const moveList = new MoveList();
			const recorder = new RunRecorder(moveList);
			let failure: string | null = null;
			try {
				runProgram(program, start, recorder.listener);
			} catch (e) {
				failure = describeError(e);
			} finally {
				recorder.finish();
			}
			return finish(start, moveList, failure);
		}
	};
}

// The median of numbers in order: the middle one, or the mean of the two
// in the middle.
export function median(sorted: readonly number[]): number | null {
	if (sorted.length === 0) return null;
	const mid = Math.floor(sorted.length / 2);
	const upper = sorted[mid] ?? 0;
	return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

// A mean, to one decimal place.
export function mean(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sum = values.reduce((a, b) => a + b, 0);
	return Math.round((sum / values.length) * 10) / 10;
}

// The numbers for a race's cubes (in order).
export function raceStats(results: readonly CubeResult[]): RaceStats {
	const failures: RaceFailure[] = [];
	const moves: number[] = [];
	const quarterTurns: number[] = [];
	results.forEach((result, index) => {
		if (result.failure === null) {
			moves.push(result.moves);
			quarterTurns.push(result.quarterTurns);
		} else {
			failures.push({ index, reason: result.failure });
		}
	});
	moves.sort((a, b) => a - b);
	const counts = new Map<number, number>();
	for (const m of moves) counts.set(m, (counts.get(m) ?? 0) + 1);
	return {
		count: results.length,
		solved: moves.length,
		failures,
		best: moves[0] ?? null,
		worst: moves.at(-1) ?? null,
		mean: mean(moves),
		median: median(moves),
		meanQuarterTurns: mean(quarterTurns),
		histogram: [...counts]
	};
}

// A race stops when this many cubes in a row aren't solved: the program
// is surely broken, and a program that runs to the step limit takes
// many seconds a cube.
export const MAX_UNSOLVED_IN_A_ROW = 10;

export interface RaceOptions {
	count?: number;
	// Stop after this many unsolved cubes in a row.
	maxUnsolvedInARow?: number;
	// Called after each cube: how many are done, of how many.
	onProgress?: (done: number, count: number) => void;
	now?: () => number;
	date?: () => Date;
}

// Race a solver on a seed's scrambles.  Throws a ProgramError if a program
// can't be run at all; a cube it can't solve is a failure in the stats.
export function race(racer: Racer, seed: number, options: RaceOptions = {}): RaceResult {
	const {
		count = RACE_COUNT,
		maxUnsolvedInARow = MAX_UNSOLVED_IN_A_ROW,
		onProgress,
		now = Date.now,
		date = (): Date => new Date()
	} = options;
	const started = now();
	const { name, hash, solve } = prepareRacer(racer);
	const results: CubeResult[] = [];
	let inARow = 0;
	let stopped: string | undefined;
	for (let i = 0; i < count; i++) {
		const result = solve(applyMoves(Permutation.identity(), raceScramble(seed, i)));
		results.push(result);
		onProgress?.(i + 1, count);
		inARow = result.failure === null ? 0 : inARow + 1;
		if (inARow >= maxUnsolvedInARow && i + 1 < count) {
			stopped = `Stopped after ${inARow} unsolved cubes in a row`;
			break;
		}
	}
	return {
		name,
		kind: racer.kind,
		hash,
		seed,
		generator: RACE_GENERATOR,
		stats: raceStats(results),
		ms: now() - started,
		date: date().toISOString(),
		...(stopped === undefined ? {} : { stopped })
	};
}
