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
import type { Call, Expr, Loc, MoveToken, Name } from './ast';
import { describeKind, nameKey, RubikonError, type Env } from './values';

export type { Env } from './values';

// Read-only: one value is shared by every repeat, lookup, and import of it.
export interface TaggedMove {
	readonly move: Readonly<Move>;
	readonly visible: boolean;
}

export type Moves = readonly TaggedMove[];

// An evaluation error, with where it happened (1-based), like
// RubikonSyntaxError.
export class RubikonEvalError extends RubikonError {
	constructor(message: string, loc: Loc) {
		super(message, loc);
		this.name = 'RubikonEvalError';
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
	const key = nameKey(name);
	const value = env.get(key);
	if (value === undefined) {
		throw new RubikonEvalError(`Unknown name: ${key}`, name.loc);
	}
	if (value.kind === 'algo') {
		throw new RubikonEvalError(`${key} is an algo: run it with do ${key}`, name.loc);
	}
	if (value.kind !== 'moves') {
		throw new RubikonEvalError(
			`Expected moves, but ${key} is ${describeKind(value.kind)}`,
			name.loc
		);
	}
	return value.moves;
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

// The built-in functions that make moves.
export const BUILT_INS: ReadonlySet<string> = new Set(['commutator', 'inverse', 'reflect', 'show']);

// The built-in functions that make moves, and functions (`fun`) bound in
// env.
function evaluateCall(call: Call, env: Env): Moves {
	if (call.module !== null || !BUILT_INS.has(call.name)) {
		return callBound(call, env);
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
			return callBound(call, env);
	}
}

// A call of a function bound in env (a `fun`), which must give moves.
function callBound(call: Call, env: Env): Moves {
	const key = nameKey(call);
	const bound = env.get(key);
	if (bound?.kind === 'algo') {
		throw new RubikonEvalError(`${key} is an algo: run it with do ${key}(…)`, call.loc);
	}
	if (bound?.kind !== 'fun') {
		throw new RubikonEvalError(`Unknown function: ${key}`, call.loc);
	}
	const result = bound.apply(call, env);
	if (result.kind !== 'moves') {
		throw new RubikonEvalError(
			`Expected moves, but ${key}(…) gives ${describeKind(result.kind)}`,
			call.loc
		);
	}
	return result.moves;
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
