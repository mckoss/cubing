import { describe, expect, it } from 'vitest';
import { Library, type StorageLike } from './library';
import { migrateSource } from './migrate';
import { parseRubikon } from './parse';
import { race, shortHash } from './racing';
import oldBasic from './testdata/basic-2.1.rbk?raw';
import basic from '../../../rubikon/basic.rbk?raw';
import cfop from '../../../rubikon/cfop.rbk?raw';

const storage = (programs: { name: string; source: string }[]): StorageLike => {
	const data = new Map([
		['rubikon.library', JSON.stringify(programs.map((p) => ({ ...p, saved: 1 })))]
	]);
	return {
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: (key) => void data.delete(key)
	};
};

const SEEDS = [
	{ name: 'cfop', source: cfop },
	{ name: 'basic', source: basic }
];

describe('migrateSource', () => {
	it('renames search to using, keeping as t', () => {
		expect(migrateSource('search U* as t { } else search D* as t { }')).toBe(
			'using U* as t { } else using D* as t { }'
		);
	});

	it('leaves comments, strings, and other words alone', () => {
		const source = 'algo a "search me" {  # search here\n  let researched = R\n}';
		expect(migrateSource(source)).toBe(source);
	});

	it('leaves a current program as it is', () => {
		expect(migrateSource(basic)).toBe(basic);
	});
});

describe('stored programs from before 3.0', () => {
	it('replace an unedited example with the current one', () => {
		expect(shortHash(oldBasic)).toBe('f9c7db69');
		const store = storage([
			{ name: 'basic', source: oldBasic },
			{ name: 'cfop', source: cfop }
		]);
		expect(new Library(store, SEEDS).get('basic')?.source).toBe(basic);
		// Saved: a library with no seeds, on the same storage, sees it too.
		expect(new Library(store).get('basic')?.source).toBe(basic);
	});

	it('migrate an edited program, which then solves as the current basic does', () => {
		const edited = `# my copy\n${oldBasic}`;
		const store = storage([{ name: 'mine', source: edited }]);
		const migrated = new Library(store, SEEDS).get('mine')?.source ?? '';
		expect(migrated).toBe(migrateSource(edited));
		expect(new Library(store, SEEDS).get('mine')?.source).toBe(migrated);
		expect(() => parseRubikon(migrated)).not.toThrow();
		const run = (source: string): unknown =>
			race({ kind: 'rubikon', name: 'basic', source, modules: { cfop } }, 1, { count: 25 }).stats;
		expect(run(migrated)).toEqual(run(basic));
		expect(run(migrated)).toMatchObject({ solved: 25 });
	});
});

describe('parse', () => {
	it('says search is now using', () => {
		expect(() => parseRubikon('algo main {\n  search U* as t { }\n}')).toThrow(
			'`search` is now `using` (Rubikon 3.0): using U* as t { … }'
		);
	});
});
