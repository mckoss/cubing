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
		expect(migrateSource('algo main { search U* as t { } else search D* as t { } }')).toBe(
			'algo main { using U* as t { } else using D* as t { } }'
		);
	});

	it('leaves comments, strings, and other words alone', () => {
		const source =
			'algo main "search me" {  # search here\n  let researched = R\n  search U* as t { }\n}';
		expect(migrateSource(source)).toBe(
			'algo main "search me" {  # search here\n  let researched = R\n  using U* as t { }\n}'
		);
	});

	it('leaves a program that parses as it is, even with search as a name', () => {
		expect(migrateSource(basic)).toBe(basic);
		const named = 'let search = R U\nalgo main {\n  do search\n}';
		expect(migrateSource(named)).toBe(named);
	});

	it("leaves a program that wouldn't parse renamed either", () => {
		const broken = 'algo main { search U* as t { case -> } }';
		expect(migrateSource(broken)).toBe(broken);
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
	it('says search is now using, where the search is', () => {
		expect(() => parseRubikon('algo main {\n  search U* as t { }\n}')).toThrow(
			'2:3: `search` is now `using` (Rubikon 3.0): using U* as t { … }'
		);
		// After a do, which reads search as a name and U as a move.
		expect(() => parseRubikon('algo main {\n  do R U\n  search U* as t { }\n}')).toThrow(
			'3:3: `search` is now `using`'
		);
		expect(() => parseRubikon(oldBasic)).toThrow(/^77:\d+: `search` is now `using`/);
		// Not for one in a comment.
		expect(() => parseRubikon('# was: search U* as t\nalgo main { do R) }')).toThrow(
			/^2:\d+: Expected/
		);
	});
});
