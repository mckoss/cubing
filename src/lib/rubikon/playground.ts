// What the playground runs, until the runtime (PLAN.md, milestone 4) can
// run a whole program: a program's lets, and a line of moves played
// against them.  Each run is a list of events (events.ts), the same stream
// the runtime will produce, so the page records it with record.ts.

import type { Algo, Expr, Loc, RubikonFile } from './ast';
import type { RunEvent } from './events';
import {
	RubikonEvalError,
	evaluateLets,
	evaluateModule,
	evaluateMoves,
	type Env,
	type Moves
} from './moves';
import { RubikonSyntaxError, parseRubikon } from './parse';

// An error to show, with where it is: in the program (module null), or in
// a module it imports.
export class ProgramError extends Error {
	constructor(
		message: string,
		readonly line: number | null,
		readonly column: number | null,
		readonly module: string | null = null
	) {
		super(message);
		this.name = 'ProgramError';
	}

	// Where, as "3:7" or "cfop 3:7".
	get where(): string {
		const at = this.line === null ? '' : `${this.line}:${this.column}`;
		return [this.module, at].filter((s) => s).join(' ');
	}
}

// A parse or evaluation error as a ProgramError; other errors are bugs, and
// are thrown again.
function programError(e: unknown, module: string | null): ProgramError {
	if (e instanceof ProgramError) return e;
	if (e instanceof RubikonSyntaxError || e instanceof RubikonEvalError) {
		// The message starts with the place; it's shown separately.
		const message = e.message.replace(/^\d+:\d+: /, '');
		return new ProgramError(message, e.line, e.column, module);
	}
	throw e;
}

export interface LetEntry {
	name: string;
	// The algos it's inside (their names or descriptions), outermost first.
	path: string[];
	loc: Loc;
	moves: Moves;
}

export interface EvaluatedProgram {
	file: RubikonFile;
	// Every let that could be evaluated, in the order written.
	lets: LetEntry[];
	// The names a line of moves can use: imports, the top-level lets, and
	// the lets inside algos (first one wins if two algos use a name).
	scope: Map<string, Moves>;
}

// Finds an imported module's source by its name (from the library).
export type FindModule = (name: string) => string | undefined;

// Parse and evaluate a program's lets, with its imports.
export function evaluateProgram(source: string, findModule: FindModule): EvaluatedProgram {
	let file: RubikonFile;
	try {
		file = parseRubikon(source);
	} catch (e) {
		throw programError(e, null);
	}
	const modules = importsOf(file, findModule, [], new Map());
	let module;
	try {
		module = evaluateModule(file, modules);
	} catch (e) {
		throw programError(e, null);
	}
	const lets: LetEntry[] = [];
	for (const def of file.defs) {
		if (def.kind === 'let') {
			const moves = module.scope.get(def.name);
			if (moves !== undefined) lets.push({ name: def.name, path: [], loc: def.loc, moves });
		}
	}
	const scope = new Map(module.scope);
	for (const def of file.defs) {
		if (def.kind === 'algo') algoLets(def, module.scope, [], lets);
	}
	for (const entry of lets) {
		if (!scope.has(entry.name)) scope.set(entry.name, entry.moves);
	}
	return { file, lets, scope };
}

// The lets in an algo's body and the algos nested in it.  An algo with
// parameters is skipped: its lets may use them, which only the runtime
// knows.
function algoLets(algo: Algo, env: Env, path: string[], out: LetEntry[]): void {
	if (algo.params !== null && algo.params.length > 0) return;
	const inside = [...path, algo.name ?? algo.description ?? 'algo'];
	let scope: Map<string, Moves>;
	try {
		scope = evaluateLets(algo.body, env);
	} catch (e) {
		throw programError(e, null);
	}
	for (const statement of algo.body) {
		if (statement.kind === 'let') {
			const moves = scope.get(statement.name);
			if (moves !== undefined) {
				out.push({ name: statement.name, path: inside, loc: statement.loc, moves });
			}
		}
	}
	for (const statement of algo.body) {
		if (statement.kind === 'algo') algoLets(statement, scope, inside, out);
	}
}

// Each imported module's exports, by name, evaluated from the library.
// `importing` is the chain of modules being imported, to catch a circle.
function importsOf(
	file: RubikonFile,
	findModule: FindModule,
	importing: string[],
	cache: Map<string, Env>
): Map<string, Env> {
	const modules = new Map<string, Env>();
	for (const imp of file.imports) {
		const where = importing.at(-1) ?? null;
		if (importing.includes(imp.module)) {
			throw new ProgramError(
				`Circular import: ${[...importing, imp.module].join(' → ')}`,
				imp.loc.line,
				imp.loc.column,
				where
			);
		}
		let exports = cache.get(imp.module);
		if (exports === undefined) {
			const source = findModule(imp.module);
			if (source === undefined) {
				throw new ProgramError(
					`No program named ${imp.module} in the library to import`,
					imp.loc.line,
					imp.loc.column,
					where
				);
			}
			const chain = [...importing, imp.module];
			let imported: RubikonFile;
			try {
				imported = parseRubikon(source);
			} catch (e) {
				throw programError(e, imp.module);
			}
			const inner = importsOf(imported, findModule, chain, cache);
			try {
				exports = evaluateModule(imported, inner).exports;
			} catch (e) {
				throw programError(e, imp.module);
			}
			cache.set(imp.module, exports);
		}
		modules.set(imp.module, exports);
	}
	return modules;
}

// The words put before a line of moves to parse it as a let.
const PLAY_PREFIX = 'let playground = ';

// Parse one line of moves (`R U R' U'`, `sune`, `F<R U>`).  Errors are at
// columns of the line.
export function parseMovesLine(text: string): Expr {
	if (/[\n\r]/.test(text)) {
		throw new ProgramError('Moves to play go on one line', 1, text.search(/[\n\r]/) + 1);
	}
	try {
		const file = parseRubikon(PLAY_PREFIX + text);
		const [def] = file.defs;
		if (file.imports.length > 0 || file.defs.length !== 1 || def?.kind !== 'let') {
			throw new ProgramError('Only moves can be played here', 1, 1);
		}
		return shift(def.value);
	} catch (e) {
		const error = programError(e, null);
		const column = error.column === null ? null : Math.max(1, error.column - PLAY_PREFIX.length);
		throw new ProgramError(error.message, 1, column);
	}
}

// Move every loc in an expression back by the prefix.
function shift<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map(shift) as T;
	}
	if (typeof value === 'object' && value !== null) {
		const out: Record<string, unknown> = {};
		for (const [key, v] of Object.entries(value)) {
			out[key] =
				key === 'loc' && isLoc(v)
					? { line: v.line, column: Math.max(1, v.column - PLAY_PREFIX.length) }
					: shift(v);
		}
		return out as T;
	}
	return value;
}

function isLoc(value: unknown): value is Loc {
	return typeof value === 'object' && value !== null && 'line' in value && 'column' in value;
}

// Evaluate a line of moves against a program's names.
export function evaluateMovesLine(text: string, scope: Env): Moves {
	const expr = parseMovesLine(text);
	try {
		return evaluateMoves(expr, scope);
	} catch (e) {
		throw programError(e, null);
	}
}

// The events for playing moves as one algo (a let, or a line typed in).
export function playEvents(title: string, moves: Moves, loc: Loc): RunEvent[] {
	return [
		{ kind: 'enter', name: title, description: null, loc },
		...moves.map((move): RunEvent => ({ kind: 'move', move, loc })),
		{ kind: 'leave', loc }
	];
}
