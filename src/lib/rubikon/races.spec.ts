import { describe, expect, it } from 'vitest';
import type { StorageLike } from './library';
import { BUILT_IN_RACES, RaceLog, raceKey } from './races';
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
		ms: 100,
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
		none.add(result('x', null, 'd'));
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
		log.add(result('x', null, 'd'));
		expect(log.list().length).toBe(1);
		expect(log.persisted).toBe(false);
	});

	it('skips stored results it can’t read', () => {
		const storage = memoryStorage();
		storage.setItem('rubikon.races', JSON.stringify([{ name: 1 }, result('ok', null, 'd')]));
		expect(new RaceLog(storage).list().map((r) => r.name)).toEqual(['ok']);
		storage.setItem('rubikon.races', '{not json');
		expect(new RaceLog(storage).list()).toEqual([]);
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
