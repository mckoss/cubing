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

// Start a race in a worker.
export function startRace(request: RaceRequest, handlers: RaceHandlers): RunningRace {
	let worker: Worker;
	try {
		worker = new Worker(new URL('./racing.worker.ts', import.meta.url), { type: 'module' });
	} catch (e) {
		handlers.error(`Can't start a race here: ${e instanceof Error ? e.message : String(e)}`);
		return { cancel: (): void => {} };
	}
	worker.onmessage = (event: MessageEvent<RaceMessage>): void => {
		const message = event.data;
		switch (message.kind) {
			case 'progress':
				handlers.progress(message.done, message.count);
				break;
			case 'done':
				worker.terminate();
				handlers.done(message.result);
				break;
			case 'error':
				worker.terminate();
				handlers.error(message.message);
				break;
		}
	};
	worker.onerror = (event): void => {
		event.preventDefault();
		worker.terminate();
		handlers.error(`The race stopped: ${event.message || 'the worker failed'}`);
	};
	worker.postMessage(request);
	return { cancel: (): void => worker.terminate() };
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
		result.generator
	].join('|');
}

export function isRaceResult(value: unknown): value is RaceResult {
	if (typeof value !== 'object' || value === null) return false;
	const r = value as Record<string, unknown>;
	const stats = r.stats as Record<string, unknown> | undefined;
	return (
		typeof r.name === 'string' &&
		(r.kind === 'rubikon' || r.kind === 'typescript') &&
		(typeof r.hash === 'string' || r.hash === null) &&
		typeof r.seed === 'number' &&
		typeof r.generator === 'number' &&
		typeof r.ms === 'number' &&
		typeof r.date === 'string' &&
		typeof stats === 'object' &&
		stats !== null &&
		typeof stats.count === 'number' &&
		typeof stats.solved === 'number' &&
		Array.isArray(stats.failures) &&
		Array.isArray(stats.histogram)
	);
}

// The person's own results, newest first.
export class RaceLog {
	private results: RaceResult[] = [];
	// Whether the last change reached storage.
	persisted: boolean;

	constructor(private readonly storage: StorageLike | undefined) {
		this.persisted = storage !== undefined;
		try {
			const stored = storage?.getItem(RACES_KEY) ?? null;
			const list: unknown = stored === null ? [] : JSON.parse(stored);
			if (Array.isArray(list)) {
				this.results = list.filter(isRaceResult).map((r) => ({ ...r, builtIn: false }));
			}
		} catch {
			// Missing or unreadable: start with none.
		}
	}

	list(): RaceResult[] {
		return [...this.results];
	}

	// Add a result, first, replacing the same race's earlier one.
	add(result: RaceResult): void {
		const key = raceKey(result);
		this.results = [result, ...this.results.filter((r) => raceKey(r) !== key)];
		this.write();
	}

	clear(): void {
		this.results = [];
		this.write();
	}

	private write(): void {
		try {
			if (this.results.length === 0) {
				this.storage?.removeItem(RACES_KEY);
			} else {
				this.storage?.setItem(RACES_KEY, JSON.stringify(this.results));
			}
			this.persisted = this.storage !== undefined;
		} catch {
			// Full or refused: kept in memory only.
			this.persisted = false;
		}
	}
}

// Whether a result's cubes can be made again (by this scramble generator).
export function canLoadCubes(result: RaceResult): boolean {
	return result.generator === RACE_GENERATOR;
}
