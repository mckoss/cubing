import { describe, expect, it } from 'vitest';
import { Library, type StorageLike } from './library';

class FakeStorage implements StorageLike {
	data = new Map<string, string>();
	getItem(key: string): string | null {
		return this.data.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		this.data.set(key, value);
	}
	removeItem(key: string): void {
		this.data.delete(key);
	}
}

// Storage that refuses everything (as in some private windows).
const broken: StorageLike = {
	getItem(): string | null {
		throw new Error('SecurityError');
	},
	setItem(): void {
		throw new Error('QuotaExceededError');
	},
	removeItem(): void {
		throw new Error('SecurityError');
	}
};

const SEEDS = [
	{ name: 'cfop', source: "let sexy = R U R' U'" },
	{ name: 'basic', source: 'from cfop import sexy' }
];

const names = (library: Library): string[] => library.list().map((p) => p.name);

describe('Library', () => {
	it('starts with the seeds, by name', () => {
		const library = new Library(new FakeStorage(), SEEDS);
		expect(names(library)).toEqual(['basic', 'cfop']);
		expect(library.get('cfop')?.source).toBe("let sexy = R U R' U'");
	});

	it('saves, and a new library on the same storage sees it', () => {
		const storage = new FakeStorage();
		let time = 5;
		const library = new Library(storage, SEEDS, () => time);
		time = 7;
		library.save('mine', 'let t = R U');
		const again = new Library(storage, SEEDS);
		expect(names(again)).toEqual(['basic', 'cfop', 'mine']);
		expect(again.get('mine')).toEqual({ name: 'mine', source: 'let t = R U', saved: 7 });
	});

	it("doesn't seed again once the library has been saved, even empty", () => {
		const storage = new FakeStorage();
		const library = new Library(storage, SEEDS);
		library.delete('cfop');
		library.delete('basic');
		expect(names(new Library(storage, SEEDS))).toEqual([]);
	});

	it('replaces a program saved again under its name', () => {
		const library = new Library(new FakeStorage(), SEEDS);
		library.save('cfop', 'let a = U');
		expect(library.get('cfop')?.source).toBe('let a = U');
		expect(library.list()).toHaveLength(2);
	});

	it('trims names, and refuses an empty one', () => {
		const library = new Library(new FakeStorage());
		expect(library.save('  spaced  ', 'U').name).toBe('spaced');
		expect(() => library.save('   ', 'U')).toThrow('needs a name');
	});

	it('renames, but not onto another program', () => {
		const storage = new FakeStorage();
		const library = new Library(storage, SEEDS);
		library.lastOpen = 'cfop';
		library.rename('cfop', 'algs');
		expect(names(library)).toEqual(['algs', 'basic']);
		expect(library.lastOpen).toBe('algs');
		expect(() => library.rename('algs', 'basic')).toThrow('already');
		expect(() => library.rename('nope', 'x')).toThrow('No program');
		expect(names(new Library(storage))).toEqual(['algs', 'basic']);
	});

	it('deletes', () => {
		const library = new Library(new FakeStorage(), SEEDS);
		library.lastOpen = 'basic';
		library.delete('basic');
		expect(names(library)).toEqual(['cfop']);
		expect(library.lastOpen).toBeNull();
	});

	it('remembers the last program open, if it still exists', () => {
		const storage = new FakeStorage();
		new Library(storage, SEEDS).lastOpen = 'basic';
		expect(new Library(storage, SEEDS).lastOpen).toBe('basic');
		storage.setItem('rubikon.lastOpen', 'gone');
		expect(new Library(storage, SEEDS).lastOpen).toBeNull();
	});

	it('starts from the seeds when what was stored is unreadable', () => {
		const storage = new FakeStorage();
		storage.setItem('rubikon.library', '{not json');
		expect(names(new Library(storage, SEEDS))).toEqual(['basic', 'cfop']);
		storage.setItem('rubikon.library', JSON.stringify([{ name: 'ok', source: 'U', saved: 1 }, 5]));
		expect(names(new Library(storage, SEEDS))).toEqual(['ok']);
	});

	it('works in memory without storage, or when storage refuses', () => {
		for (const storage of [undefined, broken]) {
			const library = new Library(storage, SEEDS);
			library.save('mine', 'U');
			library.rename('mine', 'yours');
			library.lastOpen = 'yours';
			library.delete('cfop');
			expect(names(library)).toEqual(['basic', 'yours']);
			expect(library.lastOpen).toBe('yours');
		}
	});
});
