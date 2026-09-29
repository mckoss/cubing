import { describe, expect, it } from 'vitest';
import type { StorageLike } from './library';
import { BUILT_IN_RACES, MAX_FAILURES, MAX_RACES, RaceLog, isRaceResult, raceKey } from './races';
import { RACE_GENERATOR, type RaceResult } from './racing';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key): string | null => data.get(key) ?? null,
		setItem: (key, value): void => {
			data.set(key, value);
		},
		removeItem: (key): void => {
			data.delete(key);
		}
	};
}

function result(name: string, hash: string | null, date: string): RaceResult {
	return {
		name,
		kind: hash === null ? 'typescript' : 'rubikon',
		hash,
		seed: 1,
		generator: RACE_GENERATOR,
		stats: {
			count: 20,
			solved: 20,
			failures: [],
			best: 90,
			worst: 150,
			mean: 120.5,
			median: 121,
			meanQuarterTurns: 130,
			histogram: [[90, 20]]
		},
		date
	};
}

describe('the race log', () => {
	it('keeps results newest first, replacing the same race, and a new row after an edit', () => {
		const storage = memoryStorage();
		const log = new RaceLog(storage);
		log.add(result('basic', 'aaaaaaaa', '2026-01-01'));
		log.add(result('basic', 'bbbbbbbb', '2026-01-02'));
		log.add(result('basic', 'aaaaaaaa', '2026-01-03'));
		expect(log.list().map((r) => [r.hash, r.date])).toEqual([
			['aaaaaaaa', '2026-01-03'],
			['bbbbbbbb', '2026-01-02']
		]);
		// Another page reads them back.
		expect(new RaceLog(storage).list().map((r) => r.hash)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
		log.clear();
		expect(new RaceLog(storage).list()).toEqual([]);
		expect(storage.data.size).toBe(0);
	});

	it('works without storage, or with storage that refuses', () => {
		const none = new RaceLog(undefined);
		none.add(result('x', null, '2026-01-01'));
		expect(none.list().length).toBe(1);
		expect(none.persisted).toBe(false);
		const refusing: StorageLike = {
			getItem: (): string => {
				throw new Error('no');
			},
			setItem: (): void => {
				throw new Error('no');
			},
			removeItem: (): void => {}
		};
		const log = new RaceLog(refusing);
		log.add(result('x', null, '2026-01-01'));
		expect(log.list().length).toBe(1);
		expect(log.persisted).toBe(false);
	});

	it('skips stored results it can’t read', () => {
		const storage = memoryStorage();
		storage.setItem(
			'rubikon.races',
			JSON.stringify([{ name: 1 }, result('ok', null, '2026-01-01')])
		);
		expect(new RaceLog(storage).list().map((r) => r.name)).toEqual(['ok']);
		storage.setItem('rubikon.races', '{not json');
		expect(new RaceLog(storage).list()).toEqual([]);
	});

	it('keeps at most 50 results, and 50 unsolved cubes of each', () => {
		const storage = memoryStorage();
		const log = new RaceLog(storage);
		for (let i = 0; i < MAX_RACES + 5; i++)
			log.add(result('p', `hash${i}`, `2026-01-01T00:00:${String(i).padStart(2, '0')}`));
		expect(log.list().length).toBe(MAX_RACES);
		expect(log.list()[0]?.hash).toBe(`hash${MAX_RACES + 4}`);
		const failing = result('bad', 'ffffffff', '2026-01-02');
		failing.stats = {
			...failing.stats,
			count: 500,
			solved: 0,
			failures: Array.from({ length: 500 }, (_, index) => ({ index, reason: 'no' }))
		};
		log.add(failing);
		const [kept] = new RaceLog(storage).list();
		expect(kept?.stats.failures.length).toBe(MAX_FAILURES);
		expect((kept?.stats.count ?? 0) - (kept?.stats.solved ?? 0)).toBe(500);
	});

	it('reads storage again before adding, so results saved meanwhile stay', () => {
		const storage = memoryStorage();
		const stale = new RaceLog(storage);
		new RaceLog(storage).add(result('other', 'aaaaaaaa', '2026-01-01'));
		stale.add(result('late', 'bbbbbbbb', '2026-01-02'));
		expect(new RaceLog(storage).list().map((r) => r.name)).toEqual(['late', 'other']);
	});

	it('drops its oldest results when storage is full, rather than none being kept', () => {
		const storage = memoryStorage();
		const log = new RaceLog(storage);
		for (let i = 0; i < 8; i++) log.add(result('p', `hash${i}`, '2026-01-01'));
		// Room for about two results.
		const full: typeof storage = {
			...storage,
			setItem: (key, value): void => {
				if (value.length > 1200) throw new Error('QuotaExceededError');
				storage.setItem(key, value);
			}
		};
		const tight = new RaceLog(full);
		tight.add(result('p', 'newest00', '2026-01-02'));
		expect(tight.list().length).toBe(9);
		expect(tight.persisted).toBe(false);
		const stored = new RaceLog(storage).list();
		expect(stored.length).toBeGreaterThan(0);
		expect(stored.length).toBeLessThan(9);
		expect(stored[0]?.hash).toBe('newest00');
	});

	it('drops stored results of the wrong shape', () => {
		const good = result('ok', null, '2026-01-01');
		const bad = [
			{ ...good, date: 'not a date' },
			{ ...good, stats: { ...good.stats, failures: [{ index: 'x', reason: 'r' }] } },
			{
				...good,
				stats: {
					...good.stats,
					solved: 18,
					failures: [
						{ index: 1, reason: 'r' },
						{ index: 1, reason: 'r' }
					]
				}
			},
			{ ...good, stats: { ...good.stats, histogram: [[1, 'two']] } },
			{ ...good, stats: { ...good.stats, best: 'x' } }
		];
		for (const b of bad) expect(isRaceResult(b)).toBe(false);
		expect(isRaceResult(good)).toBe(true);
	});

	it('has the built-in benchmarks, marked', () => {
		expect(BUILT_IN_RACES.map((r) => r.name)).toEqual([
			'basic',
			'Basic Modern Solution (TypeScript)',
			'Singmaster (TypeScript)'
		]);
		expect(BUILT_IN_RACES.every((r) => r.builtIn)).toBe(true);
		const [first] = BUILT_IN_RACES;
		if (first === undefined) throw new Error('no built-in races');
		expect(raceKey(first)).not.toBe(raceKey({ ...first, builtIn: false }));
	});
});
