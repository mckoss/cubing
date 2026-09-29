// What the playground runs: a program's `algo main` (with the runtime,
// runtime.ts), or another of its algos without parameters (nested ones
// too), or one of its lets (named sequences), or a line of moves played
// against them.
// Each run is a stream of events (events.ts), which the page records with
// record.ts.

import type { Permutation } from '../cube/permutation';
import type { Algo, Expr, Loc, RubikonFile } from './ast';
import type { RunEvent, RunListener } from './events';
import { evaluateMoves, type Moves } from './moves';
import { parseRubikon } from './parse';
import {
	evaluateLets,
	evaluateModule,
	run,
	runMain,
	type RunOptions,
	type RunResult
} from './runtime';
import { RubikonError, type Env, type Value } from './values';

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

// Which module each node's loc belongs to (the imported modules' locs;
// the program's own aren't in it).
type Owners = WeakMap<Loc, string>;

// A Rubikon error (parse, evaluation, or runtime) as a ProgramError, in
// the module whose syntax tree has its loc, else in `module`.  Other errors
// are bugs, and are thrown again.
function programError(e: unknown, module: string | null, owners?: Owners): ProgramError {
	if (e instanceof ProgramError) return e;
	if (e instanceof RubikonError) {
		// The message starts with the place; it's shown separately.
		const message = e.message.replace(/^\d+:\d+: /, '');
		return new ProgramError(message, e.line, e.column, owners?.get(e.loc) ?? module);
	}
	throw e;
}

// Note every loc in a syntax tree as the module's.
function claimLocs(value: unknown, module: string, owners: Owners): void {
	if (Array.isArray(value)) {
		for (const item of value) claimLocs(item, module, owners);
	} else if (typeof value === 'object' && value !== null) {
		for (const [key, v] of Object.entries(value)) {
			if (key === 'loc' && isLoc(v)) owners.set(v, module);
			else claimLocs(v, module, owners);
		}
	}
}

export interface LetEntry {
	name: string;
	// The algos it's inside (their names or descriptions), outermost first.
	path: string[];
	loc: Loc;
	moves: Moves;
}

// An algo without parameters, which Run can run by itself.
export interface AlgoEntry {
	// Its name (else its description), after those of the algos it's
	// inside, outermost first: ["main", "First Face"].
	path: string[];
	def: Algo;
	// The names it can use: the top level's, and the lets of the algos
	// it's inside.
	env: Env;
}

export interface EvaluatedProgram {
	file: RubikonFile;
	// The library programs it imports (directly or not), parsed, by name.
	modules: ReadonlyMap<string, RubikonFile>;
	// Whether it has an `algo main` to run.
	hasMain: boolean;
	// Every let of moves that could be evaluated, in the order written.
	lets: LetEntry[];
	// Every algo without parameters (and not inside one with them), in the
	// order written, nested ones after the algo they're in.
	algos: AlgoEntry[];
	// The names a line of moves can use: imports, the top-level lets, and
	// the lets inside algos (first one wins if two algos use a name).
	scope: Env;
	owners: Owners;
}

// Finds an imported module's source by its name (from the library).
export type FindModule = (name: string) => string | undefined;

// Parse and evaluate a program's definitions, with its imports.
export function evaluateProgram(source: string, findModule: FindModule): EvaluatedProgram {
	let file: RubikonFile;
	try {
		file = parseRubikon(source);
	} catch (e) {
		throw programError(e, null);
	}
	const modules = new Map<string, RubikonFile>();
	const owners: Owners = new WeakMap();
	const imported = importsOf(file, findModule, [], new Map(), modules, owners);
	let module;
	try {
		module = evaluateModule(file, imported);
	} catch (e) {
		throw programError(e, null, owners);
	}
	const lets: LetEntry[] = [];
	for (const def of file.defs) {
		if (def.kind === 'let') {
			const value = module.scope.get(def.name);
			if (value?.kind === 'moves') {
				lets.push({ name: def.name, path: [], loc: def.loc, moves: value.moves });
			}
		}
	}
	const algos: AlgoEntry[] = [];
	for (const def of file.defs) {
		if (def.kind === 'algo') algoLets(def, module.scope, [], { lets, algos }, owners);
	}
	const algoScope = new Map<string, Value>();
	for (const entry of lets) {
		if (!algoScope.has(entry.name))
			algoScope.set(entry.name, { kind: 'moves', moves: entry.moves });
	}
	const scope: Env = { get: (key) => module.scope.get(key) ?? algoScope.get(key) };
	const main = module.scope.own().get('main');
	return { file, modules, hasMain: main?.kind === 'algo', lets, algos, scope, owners };
}

// An algo, and the lets of moves in its body, and the same for the algos
// nested in it.  An algo with parameters is skipped: its lets may use
// them, which only a run knows.
function algoLets(
	algo: Algo,
	env: Env,
	path: string[],
	out: { lets: LetEntry[]; algos: AlgoEntry[] },
	owners: Owners
): void {
	if (algo.params !== null && algo.params.length > 0) return;
	const inside = [...path, algo.name ?? algo.description ?? 'algo'];
	out.algos.push({ path: inside, def: algo, env });
	let scope;
	try {
		scope = evaluateLets(algo.body, env);
	} catch (e) {
		throw programError(e, null, owners);
	}
	for (const statement of algo.body) {
		if (statement.kind === 'let') {
			const value = scope.get(statement.name);
			if (value?.kind === 'moves') {
				out.lets.push({
					name: statement.name,
					path: inside,
					loc: statement.loc,
					moves: value.moves
				});
			}
		}
	}
	for (const statement of algo.body) {
		if (statement.kind === 'algo') algoLets(statement, scope, inside, out, owners);
	}
}

// Each imported module's exports, by name, evaluated from the library;
// each module is parsed once, into `parsed`.  `importing` is the chain of
// modules being imported, to catch a circle.
function importsOf(
	file: RubikonFile,
	findModule: FindModule,
	importing: string[],
	cache: Map<string, ReadonlyMap<string, Value>>,
	parsed: Map<string, RubikonFile>,
	owners: Owners
): Map<string, ReadonlyMap<string, Value>> {
	const modules = new Map<string, ReadonlyMap<string, Value>>();
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
			let module: RubikonFile;
			try {
				module = parseRubikon(source);
			} catch (e) {
				throw programError(e, imp.module);
			}
			claimLocs(module, imp.module, owners);
			parsed.set(imp.module, module);
			const inner = importsOf(module, findModule, chain, cache, parsed, owners);
			try {
				exports = evaluateModule(module, inner).exports;
			} catch (e) {
				throw programError(e, imp.module, owners);
			}
			cache.set(imp.module, exports);
		}
		modules.set(imp.module, exports);
	}
	return modules;
}

// A run's limits in the page, so a program that loops can't hang it.  (A
// run is synchronous; the Basic method on a scramble takes a moment.)
export const RUN_LIMITS: Required<RunOptions> = { maxMoves: 10_000, maxSteps: 1_000_000 };

// Run a program's `algo main` on a cube, with the modules it imports.
// Events go to the listener as they happen (so a run that fails part way
// still shows what it did).
export function runProgram(
	program: EvaluatedProgram,
	state: Permutation,
	listener?: RunListener,
	options: RunOptions = RUN_LIMITS
): RunResult {
	try {
		return runMain(program.file, state, listener, program.modules, options);
	} catch (e) {
		throw programError(e, null, program.owners);
	}
}

// Run one of a program's algos by itself (see AlgoEntry) on a cube: its
// goal is checked at its end, and it's bypassed if the goal already holds.
export function runAlgo(
	program: EvaluatedProgram,
	algo: AlgoEntry,
	state: Permutation,
	listener?: RunListener,
	options: RunOptions = RUN_LIMITS
): RunResult {
	try {
		return run(algo.def, state, algo.env, listener, options);
	} catch (e) {
		throw programError(e, null, program.owners);
	}
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
