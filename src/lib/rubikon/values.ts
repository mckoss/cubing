// The values Rubikon names can hold, and the one environment every
// evaluator reads: the moves evaluator (moves.ts), the condition evaluator
// (conditions.ts), and the runtime (runtime.ts).

import type { Permutation } from '../cube/permutation';
import type { Location } from '../cube/types';
import type { Algo, Call, Cell, Loc, Name } from './ast';
import type { Moves } from './moves';

// Every Rubikon error has a line and column (1-based): a parse error
// (RubikonSyntaxError), an evaluation error (RubikonEvalError,
// RubikonConditionError), or a runtime error (RubikonRuntimeError).
export class RubikonError extends Error {
	readonly line: number;
	readonly column: number;

	constructor(message: string, loc: Loc) {
		super(`${loc.line}:${loc.column}: ${message}`);
		this.name = 'RubikonError';
		this.line = loc.line;
		this.column = loc.column;
	}
}

export type Value =
	// Moves to play (Moves), each tagged visible or not.
	| { kind: 'moves'; moves: Moves }
	// A permutation that isn't moves: cycles, or the cube state.
	| { kind: 'permutation'; perm: Permutation }
	| { kind: 'location'; name: Location }
	// Places side by side, or a layer: Set(Location).
	| { kind: 'places'; names: readonly Location[] }
	| { kind: 'pattern'; cells: readonly Cell[]; anyRotation: boolean }
	| { kind: 'bool'; value: boolean }
	// A `fun`.  It evaluates the call's arguments in the caller's env (which
	// binds `cube`), and runs its body.
	| { kind: 'fun'; name: string; apply: (call: Call, env: Env) => Value }
	// An algo defined at a file's top level, run with `do`; env is where it
	// was defined.
	| { kind: 'algo'; name: string; def: Algo; env: Env };

export type Kind = Value['kind'];

// Names in scope: a bare name ("sune"), or a module's ("cfop.sune").  A Map
// is an Env.
export interface Env {
	get(name: string): Value | undefined;
}

// No names bound.
export const EMPTY_ENV: Env = new Map<string, Value>();

// An Env from a record of names ("p", or "cfop.p" for a module's name).
export function envOf(values: Readonly<Record<string, Value>>): Env {
	return new Map(Object.entries(values));
}

// env, with one more name bound (hiding any other of that name).
export function bind(env: Env, name: string, value: Value): Env {
	return { get: (key) => (key === name ? value : env.get(key)) };
}

// The key a name is looked up by: "sune", or "cfop.sune".
export function nameKey(name: Pick<Name, 'module' | 'name'>): string {
	return name.module === null ? name.name : `${name.module}.${name.name}`;
}

// What a value is, for error messages: "a pattern".
const DESCRIPTIONS: Readonly<Record<Kind, string>> = {
	moves: 'moves',
	permutation: 'a permutation',
	location: 'a location',
	places: 'a list of places',
	pattern: 'a pattern',
	bool: 'a Bool',
	fun: 'a function',
	algo: 'an algo'
};

export function describeKind(kind: Kind): string {
	return DESCRIPTIONS[kind];
}

export function movesValue(moves: Moves): Value {
	return { kind: 'moves', moves };
}
