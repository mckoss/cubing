// The built-in Cube Racing benchmarks (benchmarks.json): run again here,
// so they can't go stale.  `npm run build:benchmarks` writes the file
// (this test, with WRITE_BENCHMARKS set).

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { race, type RaceResult, type Racer } from './racing';
import { isRaceResult } from './races';
import benchmarks from './benchmarks.json';

const rbk = (name: string): string =>
	readFileSync(new URL(`../../../rubikon/${name}.rbk`, import.meta.url), 'utf8');

// The races: seed 1, 500 cubes, for each of the default solvers.
const SEED = 1;
const RACERS: Racer[] = [
	{ kind: 'rubikon', name: 'basic', source: rbk('basic'), modules: { cfop: rbk('cfop') } },
	{ kind: 'typescript', id: 'basic' },
	{ kind: 'typescript', id: 'singmaster' }
];

const FILE = new URL('./benchmarks.json', import.meta.url);

// A result without what changes from run to run (when it was run).
function lasting(result: RaceResult): Partial<RaceResult> {
	const copy: Partial<RaceResult> = { ...result };
	delete copy.date;
	return copy;
}

const WRITE = Boolean(process.env.WRITE_BENCHMARKS);

describe('the built-in benchmarks', () => {
	let results: RaceResult[] = [];
	beforeAll(() => {
		results = RACERS.map((racer) => ({ ...race(racer, SEED), builtIn: true }));
	}, 120_000);

	it.runIf(WRITE)('are written to benchmarks.json', () => {
		writeFileSync(FILE, JSON.stringify(results, null, '\t') + '\n');
		expect(results.length).toBe(RACERS.length);
	});

	it.skipIf(WRITE)('match benchmarks.json', () => {
		const stored = (benchmarks as unknown[]).filter(isRaceResult).map(lasting);
		expect(stored).toEqual(results.map(lasting));
	});

	it('solve every cube', () => {
		for (const result of results) {
			expect(result.stats.failures, result.name).toEqual([]);
			expect(result.stats.solved).toBe(500);
		}
	});
});
