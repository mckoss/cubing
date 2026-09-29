// Run Rubikon on a cube: algos, their statements, and their goals.
//
// A run reads the syntax tree and makes one stream of events (events.ts):
// the moves, and the algos entered, left, and bypassed.  The same stream
// drives the cube simulator and builds the execution trace.
//
// The cube state is a Permutation, relative to the cube as it's held (as
// applyMoves keeps it): a whole cube turn (x y z) relabels the state, so
// conditions after it read the cube in its new frame.  A turn that isn't
// shown (not `show(…)`) is a frame change: the listener gets it as a move
// with `visible: false`, and physicalMoves() renames the moves after it
// into the frame the cube is shown in.
//
// Choices where the spec is open (see PLAN.md, "Design questions"):
//
// - `until cond max n` tests the condition before each pass, and stops as
//   soon as it holds (so it may run no passes).  If it still doesn't hold
//   after n passes, that's an error.
// - `search` tries candidates with the fewest turns first; among those with
//   as many, the first generator varies slowest, and each generator's own
//   turns go clockwise, counterclockwise, then half.  So `y* U*` tries
//   (), U, U', U2, y, y', y2, then y U, y U', …
// - `each t` takes a quarter turn: four passes, with t made after each
//   (the fourth brings the cube back).
// - Goals are persistent: at the end of every algo, every goal reached so
//   far (by an algo that finished or was bypassed) must still hold, read
//   in the frame the cube had when its algo started.
// - Definitions at a file's top level (let, fun, algo) are bound in order;
//   funs and algos are looked up when called, so an algo can call one
//   defined after it.  No name can be defined twice or hide another.

import { Permutation } from '../cube/permutation';
import { applyMoves, formatMove, isRotation, perm, MOVE_NAMES } from '../cube/moves';
import type { Move, Turns } from '../cube/types';
import type {
	Action,
	Algo,
	Call,
	Cond,
	Definition,
	Expr,
	Fun,
	Loc,
	Param,
	RubikonFile,
	Search,
	Statement,
	Trace,
	TypeRef
} from './ast';
import { evaluateCondition, evaluateValue } from './conditions';
import type { RunEvent, RunListener } from './events';
import {
	engineMoves,
	evaluateMoves,
	formatTaggedMoves,
	type Moves,
	type TaggedMove
} from './moves';
import { describeKind, nameKey, RubikonError, type Env, type Kind, type Value } from './values';

// A runtime error, with where it happened (1-based).
export class RubikonRuntimeError extends RubikonError {
	constructor(message: string, loc: Loc) {
		super(message, loc);
		this.name = 'RubikonRuntimeError';
	}
}

export interface RunOptions {
	// At most this many moves (turns, shown or not) in a run.
	maxMoves?: number;
	// At most this many steps: statements run, and search candidates tried.
	maxSteps?: number;
}

export interface RunResult {
	// The cube after the run, relative to how it's held at the end.
	state: Permutation;
	events: RunEvent[];
}

const DEFAULT_MAX_MOVES = 100_000;
const DEFAULT_MAX_STEPS = 1_000_000;
// Algos and funs calling each other: deeper than this is surely a loop.
const MAX_DEPTH = 100;

// --- Scopes ---

// Names defined in a block, over the names around it.  No name can be
// defined twice, or hide one from around it.
export class Scope implements Env {
	private readonly names = new Map<string, Value>();

	constructor(private readonly parent: Env | null = null) {}

	get(name: string): Value | undefined {
		return this.names.get(name) ?? this.parent?.get(name);
	}

	has(name: string): boolean {
		return this.get(name) !== undefined;
	}

	define(name: string, value: Value, loc: Loc): void {
		if (name === 'cube') {
			throw new RubikonRuntimeError('cube is the cube itself; it cannot be defined', loc);
		}
		if (this.has(name)) {
			throw new RubikonRuntimeError(`Already defined: ${name}`, loc);
		}
		this.names.set(name, value);
	}

	// The names defined here (not around it), in order.
	own(): ReadonlyMap<string, Value> {
		return this.names;
	}
}

// --- Types ---

// The kinds of value each type takes.  Types not listed here (Int, Cubie,
// Orient, …) aren't checked yet.
const TYPE_KINDS: Readonly<Record<string, readonly Kind[]>> = {
	Moves: ['moves'],
	Permutation: ['permutation', 'moves'],
	Location: ['location'],
	EdgeLocation: ['location'],
	CornerLocation: ['location'],
	CenterLocation: ['location'],
	Pattern: ['pattern'],
	Bool: ['bool'],
	Set: ['places', 'location']
};

function checkType(value: Value, type: TypeRef | null, what: string, loc: Loc): void {
	const kinds = type === null ? undefined : TYPE_KINDS[type.name];
	if (type !== null && kinds !== undefined && !kinds.includes(value.kind)) {
		throw new RubikonRuntimeError(
			`${what} should be ${type.name}, not ${describeKind(value.kind)}`,
			loc
		);
	}
}

// --- Printing values (for trace) ---

export function formatValue(value: Value): string {
	switch (value.kind) {
		case 'moves':
			return value.moves.length === 0 ? '()' : formatTaggedMoves(value.moves);
		case 'permutation':
			return value.perm.toString();
		case 'location':
			return value.name;
		case 'places':
			return value.names.join(' ');
		case 'pattern': {
			const cells = value.cells
				.map((cell) =>
					cell.kind === 'any' ? '_' : cell.kind === 'not' ? `!${cell.face}` : cell.face
				)
				.join('');
			return `/${cells}/${value.anyRotation ? 'r' : ''}`;
		}
		case 'bool':
			return String(value.value);
		case 'fun':
		case 'algo':
			return value.name;
	}
}

// --- Searches ---

// A generator's candidates, shortest first: none, the quarter turns
// (clockwise, then counterclockwise), then the half turn.  U'* is U*; U2*
// is only (), U2.
function generatorTurns(move: Move): Turns[] {
	return move.turns === 2 ? [2] : [1, 3, 2];
}

// Every candidate of a search's generators, fewest turns first; among as
// many turns, the first generator varies slowest.
export function searchCandidates(generators: readonly TaggedMove[]): Moves[] {
	let combos: Moves[] = [[]];
	for (const { move, visible } of generators) {
		const options: Moves[] = [
			[],
			...generatorTurns(move).map((turns): Moves => [{ move: { name: move.name, turns }, visible }])
		];
		combos = combos.flatMap((prefix) => options.map((option) => [...prefix, ...option]));
	}
	// A stable sort keeps the nested order among candidates of one length.
	return combos
		.map((moves, i) => ({ moves, i }))
		.sort((a, b) => a.moves.length - b.moves.length || a.i - b.i)
		.map(({ moves }) => moves);
}

// --- Frames ---

// Moves already renamed, by frame and move.
const renamedCache = new Map<string, Move>();

// The move, made after the cube was turned by `frame` without showing it,
// as it looks from the frame the cube is shown in.
export function renameMove(frame: Permutation, move: Move): Move {
	const key = `${frame.toString()}|${move.name}${move.turns}`;
	const cached = renamedCache.get(key);
	if (cached !== undefined) {
		return cached;
	}
	const target = frame.compose(perm(move.name, move.turns)).compose(frame.inverse());
	for (const name of MOVE_NAMES) {
		for (const turns of [1, 2, 3] as const) {
			if (perm(name, turns).equals(target)) {
				const renamed: Move = { name, turns };
				renamedCache.set(key, renamed);
				return renamed;
			}
		}
	}
	throw new Error(`No move is ${formatMove(move)} seen from another frame`);
}

// The moves a run shows, in the frame the cube is shown in: frame changes
// (whole cube turns not shown) left out, and the moves after them renamed.
// Shown whole cube turns stay, as they turn the cube on screen too.
export function physicalMoves(events: readonly RunEvent[]): Move[] {
	let frame = Permutation.identity();
	const result: Move[] = [];
	for (const event of events) {
		if (event.kind !== 'move') {
			continue;
		}
		const { move, visible } = event.move;
		if (isRotation(move.name) && !visible) {
			frame = frame.compose(perm(move.name, move.turns));
		} else if (isRotation(move.name)) {
			result.push(move);
		} else {
			result.push(renameMove(frame, move));
		}
	}
	return result;
}

// --- Running ---

// An algo while it runs (for `until goal`), and once its goal is reached
// (it must hold at the end of every later algo): its goal is read in its
// scope, and in the frame the algo started in.
interface Running {
	def: Algo;
	scope: Env;
	orientation: Permutation;
}

// Where statements run: in an algo (which may have a goal), or in a fun
// (which reads the cube it was called on, and can't move it).
interface Context {
	algo: Running | null;
	fun: { state: Permutation } | null;
}

// What a block does: runs to its end, or returns a value (in a fun).
type Outcome = Value | undefined;

function algoName(def: Algo): string {
	return def.description ?? def.name ?? 'an unnamed algo';
}

class Runner {
	events: RunEvent[] = [];
	// All whole cube turns made so far, one after another.
	private orientation = Permutation.identity();
	private readonly reached: Running[] = [];
	private moves = 0;
	private steps = 0;
	private depth = 0;
	private readonly maxMoves: number;
	private readonly maxSteps: number;

	constructor(
		public state: Permutation,
		private readonly listener: RunListener | undefined,
		options: RunOptions = {}
	) {
		this.maxMoves = options.maxMoves ?? DEFAULT_MAX_MOVES;
		this.maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
	}

	private emit(event: RunEvent): void {
		this.events.push(event);
		this.listener?.(event);
	}

	private step(loc: Loc): void {
		if (++this.steps > this.maxSteps) {
			throw new RubikonRuntimeError(`Too many steps (more than ${this.maxSteps})`, loc);
		}
	}

	private play(moves: Moves, loc: Loc): void {
		for (const tagged of moves) {
			if (++this.moves > this.maxMoves) {
				throw new RubikonRuntimeError(`Too many moves (more than ${this.maxMoves})`, loc);
			}
			const { move } = tagged;
			this.state = applyMoves(this.state, [move]);
			if (isRotation(move.name)) {
				this.orientation = this.orientation.compose(perm(move.name, move.turns));
			}
			this.emit({ kind: 'move', move: tagged, loc });
		}
	}

	// The state as it reads in the frame of an earlier orientation: the whole
	// cube turns made since then undone.
	private stateIn(orientation: Permutation): Permutation {
		const since = orientation.inverse().compose(this.orientation);
		return since.compose(this.state).compose(since.inverse());
	}

	// The state conditions read: the cube a fun was called on, or the cube.
	private reading(ctx: Context): Permutation {
		return ctx.fun?.state ?? this.state;
	}

	private value(expr: Expr, scope: Env, ctx: Context): Value {
		return evaluateValue(expr, this.reading(ctx), scope);
	}

	private test(cond: Cond, scope: Env, ctx: Context, state = this.reading(ctx)): boolean {
		if (cond.kind === 'goal') {
			// The algo's goal, read in the frame the algo started in.
			const running = ctx.algo;
			if (running === null || running.def.goal === null) {
				throw new RubikonRuntimeError('`goal` is used in an algo without a goal', cond.loc);
			}
			return this.goalHolds(running.def.goal, running.scope, running.orientation);
		}
		return evaluateCondition(cond, state, scope);
	}

	private goalHolds(goal: Cond, scope: Env, orientation: Permutation): boolean {
		return evaluateCondition(goal, this.stateIn(orientation), scope);
	}

	// --- Algos ---

	runAlgo(def: Algo, scope: Scope, loc: Loc): void {
		if (++this.depth > MAX_DEPTH) {
			throw new RubikonRuntimeError(`Algos nested too deep (more than ${MAX_DEPTH})`, loc);
		}
		try {
			this.runAlgoBody(def, scope);
		} finally {
			this.depth--;
		}
	}

	private runAlgoBody(def: Algo, scope: Scope): void {
		const { name, description } = def;
		const running: Running = { def, scope, orientation: this.orientation };
		if (def.goal !== null && this.goalHolds(def.goal, scope, this.orientation)) {
			this.emit({ kind: 'bypass', name, description, loc: def.loc });
			this.reached.push(running);
			return;
		}
		this.emit({ kind: 'enter', name, description, loc: def.loc });
		this.block(def.body, scope, { algo: running, fun: null });
		if (def.goal !== null && !this.goalHolds(def.goal, scope, running.orientation)) {
			throw new RubikonRuntimeError(`Goal not reached: ${algoName(def)}`, def.goal.loc);
		}
		for (const goal of this.reached) {
			if (goal.def.goal !== null && !this.goalHolds(goal.def.goal, goal.scope, goal.orientation)) {
				throw new RubikonRuntimeError(
					`${algoName(def)} broke the goal of ${algoName(goal.def)}`,
					def.loc
				);
			}
		}
		if (def.goal !== null) {
			this.reached.push(running);
		}
		this.emit({ kind: 'leave', loc: def.loc });
	}

	// Run an algo value with a call's arguments (or none).
	private callAlgo(
		algo: Extract<Value, { kind: 'algo' }>,
		call: Call | null,
		loc: Loc,
		env: Env,
		ctx: Context
	): void {
		const { def } = algo;
		const params = def.params ?? [];
		const args = call?.args ?? [];
		if (args.length !== params.length) {
			throw new RubikonRuntimeError(
				`${algo.name} takes ${params.length} argument${params.length === 1 ? '' : 's'}, not ${args.length}`,
				loc
			);
		}
		const scope = new Scope(algo.env);
		this.bindParams(params, args, scope, env, ctx, loc);
		this.runAlgo(def, scope, loc);
	}

	private bindParams(
		params: readonly Param[],
		args: readonly Expr[],
		scope: Scope,
		env: Env,
		ctx: Context,
		loc: Loc
	): void {
		params.forEach((param, i) => {
			const arg = args[i];
			if (arg === undefined) {
				return;
			}
			const value = this.value(arg, env, ctx);
			checkType(value, param.type, param.name, arg.loc);
			scope.define(param.name, value, loc);
		});
	}

	// Run statements by themselves; an algo among them runs as a stage (its
	// parameters, if any, unbound).
	runBody(body: readonly Statement[], env: Env): void {
		const ctx: Context = { algo: null, fun: null };
		const scope = new Scope(env);
		for (const statement of body) {
			if (statement.kind === 'algo') {
				this.step(statement.loc);
				this.runAlgo(statement, new Scope(scope), statement.loc);
			} else {
				this.statement(statement, scope, ctx);
			}
		}
	}

	// --- Funs ---

	makeFun(def: Fun, env: Env): Value {
		return {
			kind: 'fun',
			name: def.name,
			apply: (call, callerEnv): Value => this.callFun(def, env, call, callerEnv)
		};
	}

	private callFun(def: Fun, env: Env, call: Call, callerEnv: Env): Value {
		if (call.args.length !== def.params.length) {
			throw new RubikonRuntimeError(
				`${def.name} takes ${def.params.length} argument${def.params.length === 1 ? '' : 's'}, not ${call.args.length}`,
				call.loc
			);
		}
		// The cube the caller reads (a search candidate, perhaps).
		const cube = callerEnv.get('cube');
		const state = cube?.kind === 'permutation' ? cube.perm : this.state;
		const ctx: Context = { algo: null, fun: { state } };
		const scope = new Scope(env);
		this.bindParams(def.params, call.args, scope, callerEnv, ctx, call.loc);
		if (++this.depth > MAX_DEPTH) {
			throw new RubikonRuntimeError(`Functions nested too deep (more than ${MAX_DEPTH})`, call.loc);
		}
		let result: Outcome;
		try {
			result = this.block(def.body, scope, ctx);
		} finally {
			this.depth--;
		}
		if (result === undefined) {
			throw new RubikonRuntimeError(`${def.name} ended without a return`, def.loc);
		}
		checkType(result, def.result, `${def.name}'s result`, call.loc);
		return result;
	}

	// --- Statements ---

	// Run a block's statements in a scope of their own.
	private block(body: readonly Statement[], scope: Env, ctx: Context): Outcome {
		const inner = new Scope(scope);
		for (const statement of body) {
			const result = this.statement(statement, inner, ctx);
			if (result !== undefined) {
				return result;
			}
		}
		return undefined;
	}

	private statement(s: Statement, scope: Scope, ctx: Context): Outcome {
		this.step(s.loc);
		switch (s.kind) {
			case 'let': {
				const value = this.value(s.value, scope, ctx);
				checkType(value, s.type, s.name, s.loc);
				scope.define(s.name, value, s.loc);
				return undefined;
			}
			case 'fun':
				scope.define(s.name, this.makeFun(s, scope), s.loc);
				return undefined;
			case 'algo':
				if (ctx.fun !== null) {
					throw new RubikonRuntimeError('A fun cannot run an algo', s.loc);
				}
				if (s.params !== null) {
					throw new RubikonRuntimeError(
						"An algo with parameters is defined at a file's top level, not inside another",
						s.loc
					);
				}
				this.runAlgo(s, new Scope(scope), s.loc);
				return undefined;
			case 'do':
				this.do(s.value, scope, ctx, s.loc);
				return undefined;
			case 'return':
				if (ctx.fun === null) {
					throw new RubikonRuntimeError('return is only for a fun', s.loc);
				}
				return this.value(s.value, scope, ctx);
			case 'if':
				if (this.test(s.cond, scope, ctx)) {
					return this.block(s.then, scope, ctx);
				}
				return s.else === null ? undefined : this.block(s.else, scope, ctx);
			case 'match': {
				const found = s.cases.find((c) => this.test(c.cond, scope, ctx));
				const action = found?.action ?? s.otherwise;
				if (action === null) {
					throw new RubikonRuntimeError('No case matches, and there is no otherwise', s.loc);
				}
				this.action(action, scope, ctx);
				return undefined;
			}
			case 'search':
				this.search(s, scope, ctx);
				return undefined;
			case 'each':
				this.each(s.turn, s.body, scope, ctx);
				return undefined;
			case 'until':
				return this.until(s.cond, s.max, s.body, scope, ctx, s.loc);
			case 'trace':
				this.trace(s, scope, ctx);
				return undefined;
		}
	}

	private action(action: Action, scope: Env, ctx: Context): void {
		if (action.kind === 'do') {
			this.step(action.loc);
			this.do(action.value, scope, ctx, action.loc);
		}
	}

	// `do`: moves, or an algo (`do lift(/df/r)`, `do basic.main`).  Items side
	// by side run in order, so moves and algos can be mixed: `do t lift(p)`.
	private do(expr: Expr, scope: Env, ctx: Context, loc: Loc): void {
		if (ctx.fun !== null) {
			throw new RubikonRuntimeError('A fun cannot move the cube (no do)', loc);
		}
		const algo = this.algoOf(expr, scope);
		if (algo !== undefined) {
			this.callAlgo(algo, expr.kind === 'call' ? expr : null, expr.loc, scope, ctx);
			return;
		}
		if (expr.kind === 'seq' && expr.items.some((item) => this.algoOf(item, scope))) {
			for (const item of expr.items) {
				this.do(item, scope, ctx, loc);
			}
			return;
		}
		const value = this.value(expr, scope, ctx);
		if (value.kind !== 'moves') {
			throw new RubikonRuntimeError(
				value.kind === 'permutation'
					? 'Only moves can be played, not a permutation (cycles)'
					: `Only moves or an algo can be played, not ${describeKind(value.kind)}`,
				expr.loc
			);
		}
		this.play(value.moves, loc);
	}

	// The algo an expression names (`lift`, `lift(p)`, `basic.main`), if any.
	private algoOf(expr: Expr, scope: Env): Extract<Value, { kind: 'algo' }> | undefined {
		if (expr.kind !== 'name' && expr.kind !== 'call') {
			return undefined;
		}
		const value = scope.get(nameKey(expr));
		return value?.kind === 'algo' ? value : undefined;
	}

	private search(s: Search, scope: Env, ctx: Context): void {
		const generators = s.generators.flatMap((g) => evaluateMoves(g, scope));
		for (const candidate of searchCandidates(generators)) {
			this.step(s.loc);
			const state = applyMoves(this.reading(ctx), engineMoves(candidate));
			const found = s.cases.find((c) => this.test(c.cond, scope, ctx, state));
			if (found !== undefined) {
				this.searchAction(found.action, s.as, candidate, scope, ctx);
				return;
			}
		}
		if (s.otherwise !== null) {
			this.searchAction(s.otherwise, s.as, [], scope, ctx);
		} else if (s.else !== null) {
			this.search(s.else, scope, ctx);
		} else {
			throw new RubikonRuntimeError('Search found nothing, and there is no otherwise', s.loc);
		}
	}

	private searchAction(action: Action, as: string, turns: Moves, scope: Env, ctx: Context): void {
		const inner = new Scope(scope);
		inner.define(as, { kind: 'moves', moves: turns }, action.loc);
		this.action(action, inner, ctx);
	}

	private each(turn: Expr, body: readonly Statement[], scope: Env, ctx: Context): void {
		if (ctx.fun !== null) {
			throw new RubikonRuntimeError('A fun cannot move the cube (no each)', turn.loc);
		}
		const moves = evaluateMoves(turn, scope);
		const [only] = moves;
		if (moves.length !== 1 || only === undefined || only.move.turns === 2) {
			throw new RubikonRuntimeError('each takes a quarter turn: each y, each U', turn.loc);
		}
		for (let pass = 0; pass < 4; pass++) {
			this.block(body, scope, ctx);
			this.play(moves, turn.loc);
		}
	}

	private until(
		cond: Cond,
		max: number,
		body: readonly Statement[],
		scope: Env,
		ctx: Context,
		loc: Loc
	): Outcome {
		for (let pass = 0; !this.test(cond, scope, ctx); pass++) {
			if (pass === max) {
				throw new RubikonRuntimeError(
					`Still not true after ${max} pass${max === 1 ? '' : 'es'} (until … max ${max})`,
					loc
				);
			}
			this.step(loc);
			const result = this.block(body, scope, ctx);
			if (result !== undefined) {
				return result;
			}
		}
		return undefined;
	}

	private trace(s: Trace, scope: Env, ctx: Context): void {
		const text = s.parts
			.map((part) => (typeof part === 'string' ? part : formatValue(this.value(part, scope, ctx))))
			.join('');
		this.emit({ kind: 'trace', text, loc: s.loc });
	}

	// --- Modules ---

	// Bind a file's imports and top-level definitions.  modules gives each
	// imported module's exports, by module name.
	module(file: RubikonFile, modules: ReadonlyMap<string, ReadonlyMap<string, Value>>): ModuleScope {
		const imported = new Map<string, Value>();
		const define = (name: string, value: Value, loc: Loc): void => {
			if (imported.has(name)) {
				throw new RubikonRuntimeError(`Imported twice: ${name}`, loc);
			}
			imported.set(name, value);
		};
		for (const imp of file.imports) {
			const module = modules.get(imp.module);
			if (module === undefined) {
				throw new RubikonRuntimeError(`Unknown module: ${imp.module}`, imp.loc);
			}
			if (imp.kind === 'import') {
				const prefix = imp.alias ?? imp.module;
				for (const [name, value] of module) {
					define(`${prefix}.${name}`, value, imp.loc);
				}
			} else {
				for (const { name, alias } of imp.names) {
					const value = module.get(name);
					if (value === undefined) {
						throw new RubikonRuntimeError(`${imp.module} has no ${name}`, imp.loc);
					}
					define(alias ?? name, value, imp.loc);
				}
			}
		}
		const scope = new Scope(imported);
		this.definitions(file.defs, scope);
		return { scope, exports: scope.own() };
	}

	private definitions(defs: readonly Definition[], scope: Scope): void {
		const ctx: Context = { algo: null, fun: null };
		for (const def of defs) {
			if (def.kind === 'algo') {
				if (def.name === null) {
					throw new RubikonRuntimeError("An algo at a file's top level needs a name", def.loc);
				}
				scope.define(def.name, { kind: 'algo', name: def.name, def, env: scope }, def.loc);
			} else {
				this.statement(def, scope, ctx);
			}
		}
	}
}

export interface ModuleScope {
	// Everything a file's top level can use: its imports, then its own
	// definitions.
	scope: Scope;
	// Only what the file defines itself: what other modules may import.
	exports: ReadonlyMap<string, Value>;
}

// Bind a file's imports and top-level definitions (lets are evaluated on
// a solved cube).  modules gives each imported module's exports.
export function evaluateModule(
	file: RubikonFile,
	modules: ReadonlyMap<string, ReadonlyMap<string, Value>> = new Map()
): ModuleScope {
	return new Runner(Permutation.identity(), undefined).module(file, modules);
}

// Evaluate the lets among statements, in order, each able to use the names
// before it; other statements are skipped.  (For looking at an algo's
// definitions without running it.)
export function evaluateLets(statements: readonly (Statement | Definition)[], env: Env): Scope {
	const scope = new Scope(env);
	for (const s of statements) {
		if (s.kind === 'let') {
			const value = evaluateValue(s.value, Permutation.identity(), scope);
			checkType(value, s.type, s.name, s.loc);
			scope.define(s.name, value, s.loc);
		}
	}
	return scope;
}

// Load a file's imports from already parsed modules (by name), each once;
// circular imports are an error.
function loadModules(
	file: RubikonFile,
	modules: ReadonlyMap<string, RubikonFile>,
	runner: Runner,
	loaded: Map<string, ReadonlyMap<string, Value>>,
	loading: Set<string>
): ModuleScope {
	for (const imp of file.imports) {
		if (loaded.has(imp.module)) {
			continue;
		}
		const source = modules.get(imp.module);
		if (source === undefined) {
			throw new RubikonRuntimeError(`Unknown module: ${imp.module}`, imp.loc);
		}
		if (loading.has(imp.module)) {
			throw new RubikonRuntimeError(`Circular import: ${imp.module}`, imp.loc);
		}
		loading.add(imp.module);
		loaded.set(imp.module, loadModules(source, modules, runner, loaded, loading).exports);
		loading.delete(imp.module);
	}
	return runner.module(file, loaded);
}

// Run a block of statements (an algo's body, say) on a cube: a stage, run
// by itself.  env gives the names it uses.
export function run(
	what: Algo | readonly Statement[],
	state: Permutation,
	env: Env,
	listener?: RunListener,
	options?: RunOptions
): RunResult {
	const runner = new Runner(state, listener, options);
	runner.runBody('kind' in what ? [what] : what, env);
	return { state: runner.state, events: runner.events };
}

// Run a file's `algo main` on a cube.  modules are the files it may import,
// already parsed, by module name.
export function runMain(
	file: RubikonFile,
	state: Permutation,
	listener?: RunListener,
	modules: ReadonlyMap<string, RubikonFile> = new Map(),
	options?: RunOptions
): RunResult {
	const runner = new Runner(state, listener, options);
	const { scope } = loadModules(file, modules, runner, new Map(), new Set());
	const main = scope.own().get('main');
	if (main?.kind !== 'algo') {
		throw new RubikonRuntimeError('No algo main to run', file.loc);
	}
	if (main.def.params !== null && main.def.params.length > 0) {
		throw new RubikonRuntimeError('main takes no parameters', main.def.loc);
	}
	runner.runAlgo(main.def, new Scope(scope), main.def.loc);
	return { state: runner.state, events: runner.events };
}
