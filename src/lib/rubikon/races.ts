// The playground's side of Cube Racing (racing.ts): running a race in a
// Web Worker (racing.worker.ts), and keeping the person's results in the
// browser (local storage), guarded as the library is (library.ts): without
// storage, results last only as long as the page.

import type { StorageLike } from './library';
import { RACE_GENERATOR, type RaceResult, type Racer } from './racing';
import benchmarks from './benchmarks.json';

// What the page asks the worker to race.
export interface RaceRequest {
	racer: Racer;
	seed: number;
	count: number;
}

// What the worker says back.
export type RaceMessage =
	| { kind: 'progress'; done: number; count: number }
	| { kind: 'done'; result: RaceResult }
	| { kind: 'error'; message: string };

export interface RaceHandlers {
	progress(done: number, count: number): void;
	done(result: RaceResult): void;
	error(message: string): void;
}

// A race under way; cancel() stops it (and nothing more is heard from it).
export interface RunningRace {
	cancel(): void;
}

// Start a race in a worker.  Once the race is over (done, failed, or
// cancelled), nothing more is heard from it.
export function startRace(request: RaceRequest, handlers: RaceHandlers): RunningRace {
	let worker: Worker | undefined;
	let over = false;
	const end = (): void => {
		over = true;
		if (worker !== undefined) {
			worker.onmessage = null;
			worker.onerror = null;
			worker.onmessageerror = null;
			worker.terminate();
		}
	};
	const fail = (message: string): void => {
		if (over) return;
		end();
		handlers.error(message);
	};
	try {
		worker = new Worker(new URL('./racing.worker.ts', import.meta.url), { type: 'module' });
	} catch (e) {
		fail(`Can't start a race here: ${e instanceof Error ? e.message : String(e)}`);
		return { cancel: end };
	}
	worker.onmessage = (event: MessageEvent<RaceMessage>): void => {
		if (over) return;
		const message = event.data;
		switch (message.kind) {
			case 'progress':
				handlers.progress(message.done, message.count);
				break;
			case 'done':
				end();
				handlers.done(message.result);
				break;
			case 'error':
				fail(message.message);
				break;
		}
	};
	worker.onmessageerror = (): void => fail("The race stopped: its result couldn't be read");
	worker.onerror = (event): void => {
		event.preventDefault();
		fail(`The race stopped: ${event.message || 'the worker failed'}`);
	};
	worker.postMessage(request);
	return { cancel: end };
}

// The site's own results (seed 1, 500 cubes, for the default solvers):
// benchmarks.json, made by `npm run build:benchmarks`.
export const BUILT_IN_RACES: readonly RaceResult[] = (benchmarks as unknown[])
	.filter(isRaceResult)
	.map((r) => ({
		...r,
		builtIn: true
	}));

const RACES_KEY = 'rubikon.races';

// The most of the person's results kept (the oldest go first), and the
// most unsolved cubes kept for each (with its count of all of them), so the
// results stay small (well under 1 MB) beside the library in local storage.
export const MAX_RACES = 50;
export const MAX_FAILURES = 50;

// What makes two results the same race: the solver (and, for a program,
// its source's hash), the seed, how many cubes, and the scramble
// generator.  Racing it again replaces the result (the numbers are the
// same; the time and date are new).
export function raceKey(result: RaceResult): string {
	return [
		result.builtIn ? 'built-in' : 'mine',
		result.kind,
		result.name,
		result.hash ?? '',
		result.seed,
		result.stats.count,
		result.generator,
		result.stopped === undefined ? '' : 'stopped'
	].join('|');
}

export function isRaceResult(value: unknown): value is RaceResult {
	if (!isRecord(value)) return false;
	const r = value;
	return (
		typeof r.name === 'string' &&
		(r.kind === 'rubikon' || r.kind === 'typescript') &&
		(typeof r.hash === 'string' || r.hash === null) &&
		Number.isInteger(r.seed) &&
		typeof r.generator === 'number' &&
		typeof r.ms === 'number' &&
		typeof r.date === 'string' &&
		!Number.isNaN(Date.parse(r.date)) &&
		(r.stopped === undefined || typeof r.stopped === 'string') &&
		(r.builtIn === undefined || typeof r.builtIn === 'boolean') &&
		isRaceStats(r.stats)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isCount(n: unknown): n is number {
	return Number.isInteger(n) && (n as number) >= 0;
}

function isStat(n: unknown): boolean {
	return n === null || (typeof n === 'number' && Number.isFinite(n));
}

function isRaceStats(value: unknown): value is RaceResult['stats'] {
	if (!isRecord(value)) return false;
	const { count, solved, failures, histogram } = value;
	if (!isCount(count) || !isCount(solved) || solved > count) return false;
	if (!Array.isArray(failures) || failures.length > count - solved) return false;
	const indexes = new Set<number>();
	for (const f of failures) {
		if (!isRecord(f) || !isCount(f.index) || typeof f.reason !== 'string') return false;
		if (indexes.has(f.index)) return false;
		indexes.add(f.index);
	}
	if (!Array.isArray(histogram)) return false;
	for (const bar of histogram) {
		if (!Array.isArray(bar) || bar.length !== 2 || !isCount(bar[0]) || !isCount(bar[1])) {
			return false;
		}
	}
	return ['best', 'worst', 'mean', 'median', 'meanQuarterTurns'].every((k) => isStat(value[k]));
}

// A result as it's kept: with at most MAX_FAILURES of its unsolved cubes
// (count - solved says how many there were).
function trimmed(result: RaceResult): RaceResult {
	const { failures } = result.stats;
	if (failures.length <= MAX_FAILURES) return result;
	return { ...result, stats: { ...result.stats, failures: failures.slice(0, MAX_FAILURES) } };
}

// The person's own results, newest first.
export class RaceLog {
	private results: RaceResult[] = [];
	// Whether the last change reached storage.
	persisted: boolean;

	constructor(private readonly storage: StorageLike | undefined) {
		this.persisted = storage !== undefined;
		this.results = this.read() ?? [];
	}

	list(): RaceResult[] {
		return [...this.results];
	}

	// Add a result, first, replacing the same race's earlier one.  What's
	// stored is read again first, so results another page (or an earlier
	// visit to this one) saved meanwhile are kept.
	add(result: RaceResult): void {
		const key = raceKey(result);
		const current = this.read() ?? this.results;
		this.results = [trimmed(result), ...current.filter((r) => raceKey(r) !== key)].slice(
			0,
			MAX_RACES
		);
		this.write();
	}

	clear(): void {
		this.results = [];
		this.write();
	}

	// The stored results, or undefined if storage can't be read.
	private read(): RaceResult[] | undefined {
		let stored: string | null;
		try {
			if (this.storage === undefined) return undefined;
			stored = this.storage.getItem(RACES_KEY);
		} catch {
			return undefined;
		}
		try {
			const list: unknown = stored === null ? [] : JSON.parse(stored);
			return Array.isArray(list)
				? list.filter(isRaceResult).map((r) => trimmed({ ...r, builtIn: false }))
				: [];
		} catch {
			// Unreadable: start again with none.
			return [];
		}
	}

	// Store the results.  If storage is full, the oldest are dropped until
	// they fit (or none are left), so the results never hold room the
	// library needs; the page keeps them all until it closes.
	private write(): void {
		if (this.storage === undefined) {
			this.persisted = false;
			return;
		}
		for (let keep = this.results.length; ; keep = Math.floor(keep / 2)) {
			try {
				if (keep === 0) {
					this.storage.removeItem(RACES_KEY);
				} else {
					this.storage.setItem(RACES_KEY, JSON.stringify(this.results.slice(0, keep)));
				}
				this.persisted = keep === this.results.length;
				return;
			} catch {
				if (keep === 0) {
					this.persisted = false;
					return;
				}
			}
		}
	}
}

// Whether a result's cubes can be made again (by this scramble generator).
export function canLoadCubes(result: RaceResult): boolean {
	return result.generator === RACE_GENERATOR;
}
