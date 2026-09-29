// Evaluate Rubikon move expressions (R U R' U', w<p>, commutator(a, b), …)
// to moves the cube engine can play.
//
// A Moves value is a list of engine moves, each tagged with whether it's
// shown.  Face and slice turns are always shown; a whole cube turn (x y z)
// is only a change of frame unless show() tagged it (see LANGUAGE.md,
// "Whole cube turns").  The tag stays with its move through inverses,
// repeats, and mirrors.

import {
	formatMove,
	inverseTurns,
	isMoveName,
	isRotation,
	type Move,
	type MoveName
} from '../cube/moves';
import type { Call, Definition, Expr, Loc, MoveToken, Name, RubikonFile, Statement } from './ast';

// Read-only: one value is shared by every repeat, lookup, and import of it.
export interface TaggedMove {
	readonly move: Readonly<Move>;
	readonly visible: boolean;
}

export type Moves = readonly TaggedMove[];

// Names in scope: a bare name ("sune"), or a module's ("cfop.sune").
export type Env = ReadonlyMap<string, Moves>;

// An evaluation error, with where it happened (1-based), like
// RubikonSyntaxError.
export class RubikonEvalError extends Error {
	readonly line: number;
	readonly column: number;

	constructor(message: string, loc: Loc) {
		super(`${loc.line}:${loc.column}: ${message}`);
		this.name = 'RubikonEvalError';
		this.line = loc.line;
		this.column = loc.column;
	}
}

// The engine moves, tags dropped (e.g. for permutationOf or formatMoves).
export function engineMoves(moves: Moves): Move[] {
	return moves.map(({ move }) => move);
}

// Moves as Rubikon writes them: a shown whole cube turn is show(x).
export function formatTaggedMoves(moves: Moves): string {
	return moves
		.map(({ move, visible }) =>
			isRotation(move.name) && visible ? `show(${formatMove(move)})` : formatMove(move)
		)
		.join(' ');
}

export function invertTagged(moves: Moves): Moves {
	return moves
		.slice()
		.reverse()
		.map(({ move, visible }) => ({
			move: { name: move.name, turns: inverseTurns(move.turns) },
			visible
		}));
}

// --- Mirrors ---

type MirrorSlice = 'M' | 'E' | 'S';

// For each mirror: the two faces it swaps, and the slice and whole cube
// turn on the axis through it.
const MIRRORS: Readonly<Record<MirrorSlice, readonly [MoveName, MoveName, MoveName, MoveName]>> = {
	M: ['L', 'R', 'M', 'x'],
	E: ['U', 'D', 'E', 'y'],
	S: ['F', 'B', 'S', 'z']
};

// A mirror reverses clockwise.  Turns about the mirror's own axis (its
// slice and its whole cube turn) are unchanged: M -> M, x -> x.  Its two
// faces swap and invert: R -> L', since R and L' turn the same way in
// space.  Every other turn is inverted: U -> U', y -> y'.
function reflectMove(move: Move, slice: MirrorSlice): Move {
	const [a, b, axisSlice, axisTurn] = MIRRORS[slice];
	if (move.name === axisSlice || move.name === axisTurn) {
		return move;
	}
	const turns = inverseTurns(move.turns);
	if (move.name === a) {
		return { name: b, turns };
	}
	if (move.name === b) {
		return { name: a, turns };
	}
	return { name: move.name, turns };
}

export function reflectMoves(moves: Moves, slice: MirrorSlice): Moves {
	return moves.map(({ move, visible }) => ({ move: reflectMove(move, slice), visible }));
}

// --- Evaluation ---

function moveOf(token: MoveToken): Move {
	if (!isMoveName(token.name)) {
		// Wide turns (Rw) parse, but the engine has no permutation for them.
		throw new RubikonEvalError(`Wide turns are not supported yet: ${token.name}`, token.loc);
	}
	return { name: token.name, turns: token.turns };
}

function lookUp(name: Name, env: Env): Moves {
	const key = name.module === null ? name.name : `${name.module}.${name.name}`;
	const value = env.get(key);
	if (value === undefined) {
		throw new RubikonEvalError(`Unknown name: ${key}`, name.loc);
	}
	return value;
}

// More repeats than any method needs; a bigger count is surely a mistake,
// and would run out of memory.
const MAX_REPEAT = 1000;

// What an expression that isn't moves is, for error messages.
const NOT_MOVES: Readonly<Record<'location' | 'pattern' | 'cycle', string>> = {
	location: 'a location',
	pattern: 'a pattern',
	cycle: 'a permutation (cycles)'
};

// Evaluate an expression to moves.  Names are looked up in env.
export function evaluateMoves(expr: Expr, env: Env): Moves {
	switch (expr.kind) {
		case 'move': {
			const move = moveOf(expr);
			return [{ move, visible: !isRotation(move.name) }];
		}
		case 'seq':
			return expr.items.flatMap((item) => evaluateMoves(item, env));
		case 'name':
			return lookUp(expr, env);
		case 'identity':
			return [];
		case 'inverse':
			return invertTagged(evaluateMoves(expr.of, env));
		case 'repeat': {
			if (expr.times > MAX_REPEAT) {
				throw new RubikonEvalError(`Repeat count too large (at most ${MAX_REPEAT})`, expr.loc);
			}
			const once = evaluateMoves(expr.of, env);
			return Array.from({ length: expr.times }, () => once).flat();
		}
		case 'conjugate': {
			const wrapper = evaluateMoves(expr.wrapper, env);
			return [...wrapper, ...evaluateMoves(expr.body, env), ...invertTagged(wrapper)];
		}
		case 'call':
			return evaluateCall(expr, env);
		case 'location':
		case 'pattern':
		case 'cycle': {
			throw new RubikonEvalError(`Expected moves, but this is ${NOT_MOVES[expr.kind]}`, expr.loc);
		}
	}
}

// A call's arguments, checked for how many there are.
function args(call: Call, count: 1): [Expr];
function args(call: Call, count: 2): [Expr, Expr];
function args(call: Call, count: number): Expr[] {
	if (call.args.length !== count) {
		const wanted = count === 1 ? '1 argument' : `${count} arguments`;
		throw new RubikonEvalError(`${call.name} takes ${wanted}, not ${call.args.length}`, call.loc);
	}
	return call.args;
}

// The built-in functions that make moves.  (User functions, `fun`, come
// with the runtime.)
function evaluateCall(call: Call, env: Env): Moves {
	if (call.module !== null) {
		throw new RubikonEvalError(`Unknown function: ${call.module}.${call.name}`, call.loc);
	}
	switch (call.name) {
		case 'commutator': {
			const [a, b] = args(call, 2);
			const am = evaluateMoves(a, env);
			const bm = evaluateMoves(b, env);
			return [...am, ...bm, ...invertTagged(am), ...invertTagged(bm)];
		}
		case 'inverse':
			return invertTagged(evaluateMoves(args(call, 1)[0], env));
		case 'reflect': {
			const [p, s] = args(call, 2);
			return reflectMoves(evaluateMoves(p, env), mirrorOf(s));
		}
		case 'show':
			return [{ move: showTurnOf(args(call, 1)[0]), visible: true }];
		default:
			throw new RubikonEvalError(`Unknown function: ${call.name}`, call.loc);
	}
}

// reflect's second argument: a slice letter, naming the mirror's plane.
function mirrorOf(expr: Expr): MirrorSlice {
	if (
		expr.kind === 'move' &&
		expr.turns === 1 &&
		(expr.name === 'M' || expr.name === 'E' || expr.name === 'S')
	) {
		return expr.name;
	}
	throw new RubikonEvalError('reflect needs a slice for its mirror: M, E, or S', expr.loc);
}

// show's argument: one whole cube turn (x, y', z2), nothing else.
function showTurnOf(expr: Expr): Move {
	if (expr.kind === 'move') {
		const move = moveOf(expr);
		if (isRotation(move.name)) {
			return move;
		}
	}
	throw new RubikonEvalError(
		"show takes one whole cube turn (x, y, or z, with an optional ' or 2); face turns are always shown",
		expr.loc
	);
}

// --- Lets and modules ---

// Evaluate the lets among statements, in order, each able to use the
// names before it; other statements are skipped.  Returns env with the new
// names added.  A name can't be defined twice (no shadowing).
export function evaluateLets(
	statements: readonly (Statement | Definition)[],
	env: Env
): Map<string, Moves> {
	const scope = new Map(env);
	for (const statement of statements) {
		if (statement.kind !== 'let') {
			continue;
		}
		if (scope.has(statement.name)) {
			throw new RubikonEvalError(`Already defined: ${statement.name}`, statement.loc);
		}
		if (statement.type !== null && statement.type.name !== 'Moves') {
			throw new RubikonEvalError(
				`Only Moves can be evaluated here, not ${statement.type.name}`,
				statement.loc
			);
		}
		scope.set(statement.name, evaluateMoves(statement.value, scope));
	}
	return scope;
}

export interface ModuleMoves {
	// Everything a file's top level can use: its imports, then its lets.
	scope: Map<string, Moves>;
	// Only what the file defines itself: what other modules may import.
	exports: Map<string, Moves>;
}

// Evaluate a file's imports and top-level lets.  modules gives each
// imported module's exports, by module name.
export function evaluateModule(file: RubikonFile, modules: ReadonlyMap<string, Env>): ModuleMoves {
	const imported = new Map<string, Moves>();
	const define = (name: string, value: Moves, loc: Loc): void => {
		if (imported.has(name)) {
			throw new RubikonEvalError(`Imported twice: ${name}`, loc);
		}
		imported.set(name, value);
	};
	for (const imp of file.imports) {
		const module = modules.get(imp.module);
		if (module === undefined) {
			throw new RubikonEvalError(`Unknown module: ${imp.module}`, imp.loc);
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
					throw new RubikonEvalError(`${imp.module} has no ${name}`, imp.loc);
				}
				define(alias ?? name, value, imp.loc);
			}
		}
	}
	const scope = evaluateLets(file.defs, imported);
	const exports = new Map([...scope].filter(([name]) => !imported.has(name)));
	return { scope, exports };
}
