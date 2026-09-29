// The playground's library: Rubikon programs saved by name in the browser
// (local storage).  Storage can be missing or refuse (a private window,
// blocked site data), so every access is guarded: the library then lives
// only in memory, for as long as the page is open.

// The part of the Storage interface the library uses (a fake in tests).
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface Program {
	name: string;
	source: string;
	// When it was last saved (milliseconds since 1970).
	saved: number;
}

const PROGRAMS_KEY = 'rubikon.library';
const LAST_OPEN_KEY = 'rubikon.lastOpen';

// The browser's local storage, if the page may use it.
export function browserStorage(): StorageLike | undefined {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
}

function isProgram(value: unknown): value is Program {
	if (typeof value !== 'object' || value === null) return false;
	const p = value as Record<string, unknown>;
	return typeof p.name === 'string' && typeof p.source === 'string' && typeof p.saved === 'number';
}

export class Library {
	private programs = new Map<string, Program>();
	private lastOpenName: string | null = null;
	// Whether the last change reached storage (false: kept in memory only,
	// and lost when the page closes).
	persisted: boolean;

	// seeds: programs to start with when nothing has been saved yet.
	constructor(
		private readonly storage: StorageLike | undefined,
		seeds: readonly { name: string; source: string }[] = [],
		private readonly now: () => number = Date.now
	) {
		this.persisted = storage !== undefined;
		const stored = this.read(PROGRAMS_KEY);
		let loaded = false;
		if (stored !== null) {
			try {
				const list: unknown = JSON.parse(stored);
				if (Array.isArray(list)) {
					for (const p of list.filter(isProgram)) {
						this.programs.set(p.name, { name: p.name, source: p.source, saved: p.saved });
					}
					loaded = true;
				}
			} catch {
				// Unreadable: start again from the seeds.
			}
		}
		if (!loaded) {
			for (const { name, source } of seeds) {
				this.programs.set(name, { name, source, saved: this.now() });
			}
			this.write();
		}
		const last = this.read(LAST_OPEN_KEY);
		this.lastOpenName = last !== null && this.programs.has(last) ? last : null;
	}

	// Every program, by name.
	list(): Program[] {
		return [...this.programs.values()].sort((a, b) =>
			a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
	}

	get(name: string): Program | undefined {
		return this.programs.get(name);
	}

	has(name: string): boolean {
		return this.programs.has(name);
	}

	// Save a program, replacing one with the same name.
	save(name: string, source: string): Program {
		const trimmed = checkName(name);
		const program = { name: trimmed, source, saved: this.now() };
		this.programs.set(trimmed, program);
		this.write();
		return program;
	}

	rename(from: string, to: string): Program {
		const program = this.programs.get(from);
		if (program === undefined) {
			throw new Error(`No program named ${from}`);
		}
		const name = checkName(to);
		if (name === from) return program;
		if (this.programs.has(name)) {
			throw new Error(`There's already a program named ${name}`);
		}
		const renamed = { ...program, name };
		this.programs.delete(from);
		this.programs.set(name, renamed);
		if (this.lastOpenName === from) this.lastOpen = name;
		this.write();
		return renamed;
	}

	delete(name: string): void {
		this.programs.delete(name);
		if (this.lastOpenName === name) this.lastOpen = null;
		this.write();
	}

	// The program open when the page was last used.
	get lastOpen(): string | null {
		return this.lastOpenName;
	}

	set lastOpen(name: string | null) {
		this.lastOpenName = name;
		try {
			if (name === null) {
				this.storage?.removeItem(LAST_OPEN_KEY);
			} else {
				this.storage?.setItem(LAST_OPEN_KEY, name);
			}
		} catch {
			// Not remembered; the library still works.
		}
	}

	private read(key: string): string | null {
		try {
			return this.storage?.getItem(key) ?? null;
		} catch {
			return null;
		}
	}

	private write(): void {
		try {
			this.storage?.setItem(PROGRAMS_KEY, JSON.stringify(this.list()));
			this.persisted = this.storage !== undefined;
		} catch {
			// Full or refused: kept in memory only.
			this.persisted = false;
		}
	}
}

// A program's name, trimmed; it can't be empty.
function checkName(name: string): string {
	const trimmed = name.trim();
	if (trimmed === '') {
		throw new Error('A program needs a name');
	}
	return trimmed;
}
