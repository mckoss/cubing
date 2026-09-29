// Evaluate Rubikon conditions (Cond nodes) on a cube state.
//
// A cube state is a Permutation: the one that takes a solved cube to it, so
// state.apply(home) is where the sticker that started at home is now, and
// the sticker now at place L came from state.inverse().apply(L).
//
// Colors are relative to the centers: a sticker's color is the face it
// belongs on (the first letter of its home), and the cell `u` of a pattern
// means "the color of the center now on the U face".  So conditions follow
// the cube however it's held, and whole cube turns (which move the centers
// in a raw permutation) change nothing but the frame.

import { Permutation } from '../cube/permutation';
import { permutationOf } from '../cube/moves';
import {
	CORNERS,
	EDGES,
	FACE_LETTERS,
	isLocation,
	rotateName,
	type FaceLetter,
	type Location
} from '../cube/types';
import type { Call, Cell, Cond, Expr, FacePicture, Is, Loc, Name } from './ast';
import { BUILT_INS, engineMoves, evaluateMoves, invertTagged, type Moves } from './moves';
import {
	bind,
	describeKind,
	EMPTY_ENV,
	nameKey,
	RubikonError,
	type Env,
	type Value
} from './values';

export { EMPTY_ENV, envOf, type Env, type Value } from './values';

// An error evaluating a condition, with where the node is in the source.
export class RubikonConditionError extends RubikonError {
	constructor(message: string, loc: Loc) {
		super(message, loc);
		this.name = 'RubikonConditionError';
	}
}

// Every piece, by its home spelling: 'u', 'uf', 'ufl', ...
const PIECES: readonly Location[] = [...FACE_LETTERS, ...EDGES, ...CORNERS];

function isFaceLetter(face: string): face is FaceLetter {
	return FACE_LETTERS.some((f) => f === face);
}

// The name rotated to start from the given face: spellFrom('urf', 'r') is
// 'rfu'.
function spellFrom(loc: Location, face: string): Location {
	let name = loc;
	for (let i = 0; i < loc.length; i++) {
		if (name.charAt(0) === face) {
			return name;
		}
		name = rotateName(name);
	}
	throw new Error(`${loc} has no ${face} sticker`);
}

// A cube state, with the questions conditions ask of it.
class CubeView {
	private readonly from: Permutation;

	constructor(readonly state: Permutation) {
		this.from = state.inverse();
	}

	// The color of the sticker now at loc: the face it belongs on.
	colorAt(loc: Location): string {
		return this.from.apply(loc).charAt(0);
	}

	// The color named by a face letter: that of the center now on the face.
	colorOf(face: FaceLetter): string {
		return this.from.apply(face);
	}

	cellMatches(cell: Cell, loc: Location): boolean {
		switch (cell.kind) {
			case 'any':
				return true;
			case 'color':
				return this.colorAt(loc) === this.colorOf(faceLetter(cell.face));
			case 'not':
				return this.colorAt(loc) !== this.colorOf(faceLetter(cell.face));
		}
	}

	// The piece at loc, read in loc's letter order, against the cells.  A
	// pattern for another kind of piece never matches.
	matches(loc: Location, cells: readonly Cell[], anyRotation: boolean): boolean {
		if (cells.length !== loc.length) {
			return false;
		}
		const rotations = anyRotation ? cells.length : 1;
		for (let k = 0; k < rotations; k++) {
			const rotated = [...cells.slice(k), ...cells.slice(0, k)];
			let place = loc;
			let ok = true;
			for (const cell of rotated) {
				if (!this.cellMatches(cell, place)) {
					ok = false;
					break;
				}
				place = rotateName(place);
			}
			if (ok) {
				return true;
			}
		}
		return false;
	}

	// The place holds its own piece, the right way round (`x is /x/`), or
	// with any twist (`x is /x/r`).
	isHome(loc: Location, anyRotation: boolean): boolean {
		return this.matches(loc, homeCells(loc), anyRotation);
	}
}

function faceLetter(face: string): FaceLetter {
	if (!isFaceLetter(face)) {
		throw new Error(`Not a face: ${face}`);
	}
	return face;
}

// The complete pattern naming the piece at home in loc: /urf/ for urf.
function homeCells(loc: Location): Cell[] {
	return [...loc].map((face) => ({ kind: 'color', face }));
}

// The places of a layer, spelled from the face: layer(D) is d df dr db dl
// dfr drb dbl dlf (in engine order).  A slice (M E S) is the layer between
// two faces: its centers and edges, in their home spellings.
const SLICE_FACES: Readonly<Record<string, readonly [string, string]>> = {
	M: ['l', 'r'],
	E: ['u', 'd'],
	S: ['f', 'b']
};

function layerPlaces(name: string, loc: Loc): Location[] {
	const face = name.toLowerCase();
	if (name.length === 1 && isFaceLetter(face) && name !== face) {
		return PIECES.filter((piece) => piece.includes(face)).map((piece) => spellFrom(piece, face));
	}
	const between = SLICE_FACES[name];
	if (between !== undefined) {
		return PIECES.filter((piece) => piece.length < 3 && !between.some((f) => piece.includes(f)));
	}
	throw new RubikonConditionError(`layer() takes a face or a slice, not ${name}`, loc);
}

// Evaluate a condition on a cube state.  env resolves names (patterns
// bound to parameters, moves bound by `let`); the name `cube` is the state.
export function evaluateCondition(cond: Cond, state: Permutation, env: Env = EMPTY_ENV): boolean {
	return new Evaluator(state, env).cond(cond);
}

// Evaluate an expression to a value of any kind: moves, a permutation, a
// place, places, a pattern, or a Bool.  The name `cube` is the state.
export function evaluateValue(expr: Expr, state: Permutation, env: Env = EMPTY_ENV): Value {
	return new Evaluator(state, env).value(expr);
}

class Evaluator {
	private readonly cube: CubeView;
	private readonly env: Env;

	constructor(state: Permutation, env: Env) {
		this.cube = new CubeView(state);
		this.env = bind(env, 'cube', { kind: 'permutation', perm: state });
	}

	cond(cond: Cond): boolean {
		switch (cond.kind) {
			case 'and':
				return cond.items.every((item) => this.cond(item));
			case 'or':
				return cond.items.some((item) => this.cond(item));
			case 'not':
				return !this.cond(cond.of);
			case 'is':
				return this.is(cond) !== cond.negated;
			case 'face':
				return this.face(cond);
			case 'test':
				return this.test(cond.value);
			case 'equals':
				return this.equals(this.value(cond.left), this.value(cond.right), cond.loc);
			case 'has':
				throw new RubikonConditionError(
					'Not yet: `has` (how several cycles combine is an open question)',
					cond.loc
				);
			case 'goal':
				throw new RubikonConditionError(
					"Not yet: `goal` (the algo's goal is known only to the runtime)",
					cond.loc
				);
		}
	}

	private is(cond: Is): boolean {
		const place = this.location(cond.place);
		const pattern = this.value(cond.pattern);
		if (pattern.kind !== 'pattern') {
			throw new RubikonConditionError(
				`Not yet: \`is\` needs a pattern, not ${describeKind(pattern.kind)}`,
				cond.pattern.loc
			);
		}
		return this.cube.matches(place, pattern.cells, pattern.anyRotation);
	}

	// A face picture: for U, the back row ulb ub ubr, then ul u ur, then the
	// front ufl uf urf, each read from its U sticker.
	private face(cond: FacePicture): boolean {
		if (cond.face !== 'U') {
			throw new RubikonConditionError(
				`Not yet: face pictures of ${cond.face} (only U is read so far)`,
				cond.loc
			);
		}
		if (cond.rows.length !== 3 || cond.rows.some((row) => row.length !== 3)) {
			throw new RubikonConditionError('A face picture has 3 rows of 3 cells', cond.loc);
		}
		return cond.rows.every((row, i) =>
			row.every((cell, j) => {
				const place = U_PICTURE[i]?.[j];
				return place !== undefined && this.cube.cellMatches(cell, place);
			})
		);
	}

	// A value used as a condition: solved(…), placed(…), a Bool name or
	// function.
	private test(expr: Expr): boolean {
		const value = this.value(expr);
		if (value.kind !== 'bool') {
			throw new RubikonConditionError(
				`Not a condition: this is ${describeKind(value.kind)}`,
				expr.loc
			);
		}
		return value.value;
	}

	// solved(cube) (or any permutation: solved however it's held), or
	// solved(places…).
	private solved(call: Call): boolean {
		const value = this.value(this.onlyArg(call));
		const perm = asPermutation(value);
		if (perm !== undefined) {
			const view = new CubeView(perm);
			return PIECES.every((piece) => view.isHome(piece, false));
		}
		return this.placesOf(value, call).every((place) => this.cube.isHome(place, false));
	}

	private onlyArg(call: Call): Expr {
		const [arg] = call.args;
		if (call.args.length !== 1 || arg === undefined) {
			throw new RubikonConditionError(`${call.name}() takes one list of places`, call.loc);
		}
		return arg;
	}

	// The places a value names: one place, or a list.
	private placesOf(value: Value, call: Call): readonly Location[] {
		if (value.kind === 'location') {
			return [value.name];
		}
		if (value.kind === 'places') {
			return value.names;
		}
		throw new RubikonConditionError(
			`${call.name}() takes places, not ${describeKind(value.kind)}`,
			call.loc
		);
	}

	private layer(call: Call): Value {
		const [face] = call.args;
		if (call.args.length !== 1 || face === undefined || face.kind !== 'move' || face.turns !== 1) {
			throw new RubikonConditionError('layer() takes a face: layer(D)', call.loc);
		}
		return { kind: 'places', names: layerPlaces(face.name, face.loc) };
	}

	private location(expr: Expr): Location {
		const value = this.value(expr);
		if (value.kind !== 'location') {
			throw new RubikonConditionError(
				`Expected a place, not ${describeKind(value.kind)}`,
				expr.loc
			);
		}
		return value.name;
	}

	// The value of an expression.  Moves are left to the moves evaluator.
	value(expr: Expr): Value {
		switch (expr.kind) {
			case 'location':
				if (!isLocation(expr.name)) {
					throw new RubikonConditionError(`Not a location: ${expr.name}`, expr.loc);
				}
				return { kind: 'location', name: expr.name };
			case 'pattern':
				// The parser has checked the faces.
				return { kind: 'pattern', cells: expr.cells, anyRotation: expr.anyRotation };
			case 'name': {
				const bound = this.env.get(nameKey(expr));
				if (bound === undefined) {
					throw new RubikonConditionError(`Unknown name: ${nameKey(expr)}`, expr.loc);
				}
				checkBound(bound, expr);
				return bound;
			}
			case 'cycle':
				return {
					kind: 'permutation',
					perm: this.parseCycles(
						`(${expr.places.join(' ')})${['', '+', '-'][expr.twist] ?? ''}`,
						expr.loc
					)
				};
			case 'identity':
				return { kind: 'moves', moves: [] };
			case 'seq':
				return this.seq(
					expr.items.map((item) => this.value(item)),
					expr.items
				);
			case 'inverse': {
				const of = this.value(expr.of);
				return this.inverse(of, expr.of);
			}
			case 'repeat': {
				const of = this.value(expr.of);
				if (of.kind === 'permutation') {
					return { kind: 'permutation', perm: of.perm.power(expr.times) };
				}
				return { kind: 'moves', moves: evaluateMoves(expr, this.env) };
			}
			case 'move':
			case 'conjugate':
				return { kind: 'moves', moves: evaluateMoves(expr, this.env) };
			case 'call':
				return this.call(expr);
		}
	}

	private call(call: Call): Value {
		if (call.module === null) {
			switch (call.name) {
				case 'solved':
					return { kind: 'bool', value: this.solved(call) };
				case 'placed': {
					const places = this.placesOf(this.value(this.onlyArg(call)), call);
					return { kind: 'bool', value: places.every((place) => this.cube.isHome(place, true)) };
				}
				case 'layer':
					return this.layer(call);
				case 'inverse': {
					const arg = this.onlyArg(call);
					return this.inverse(this.value(arg), arg);
				}
			}
			if (BUILT_INS.has(call.name)) {
				return { kind: 'moves', moves: evaluateMoves(call, this.env) };
			}
		}
		const bound = this.env.get(nameKey(call));
		if (bound?.kind === 'fun') {
			return bound.apply(call, this.env);
		}
		if (bound?.kind === 'algo') {
			throw new RubikonConditionError(
				`${nameKey(call)} is an algo: it can't be used in a condition`,
				call.loc
			);
		}
		throw new RubikonConditionError(`Unknown function: ${nameKey(call)}(…)`, call.loc);
	}

	private inverse(of: Value, expr: Expr): Value {
		if (of.kind === 'moves') {
			return { kind: 'moves', moves: invertTagged(of.moves) };
		}
		if (of.kind === 'permutation') {
			return { kind: 'permutation', perm: of.perm.inverse() };
		}
		throw new RubikonConditionError(`Can't invert ${describeKind(of.kind)}`, expr.loc);
	}

	// Items side by side: moves in order, places as a list, or permutations
	// one after another (moves among them count as their permutations).
	private seq(values: Value[], items: Expr[]): Value {
		if (values.every((v) => v.kind === 'moves')) {
			return { kind: 'moves', moves: values.flatMap((v) => v.moves) };
		}
		if (values.every((v) => v.kind === 'location' || v.kind === 'places')) {
			return {
				kind: 'places',
				names: values.flatMap((v) => (v.kind === 'location' ? [v.name] : v.names))
			};
		}
		let perm = Permutation.identity();
		values.forEach((value, i) => {
			const next = asPermutation(value);
			if (next === undefined) {
				throw new RubikonConditionError(
					`Expected a permutation, not ${describeKind(value.kind)}`,
					items[i]?.loc ?? { line: 0, column: 0 }
				);
			}
			perm = perm.compose(next);
		});
		return { kind: 'permutation', perm };
	}

	private parseCycles(text: string, loc: Loc): Permutation {
		try {
			return Permutation.parse(text);
		} catch (e) {
			throw new RubikonConditionError(e instanceof Error ? e.message : String(e), loc);
		}
	}

	// `==`: same place and facing, same pattern (a cubie with its
	// orientation; with /r, the same up to rotation), same Bool, or same
	// permutation (moves compare as the permutation they make).  Values of
	// different kinds are an error.
	private equals(a: Value, b: Value, loc: Loc): boolean {
		if (a.kind === 'location' && b.kind === 'location') {
			return a.name === b.name;
		}
		if (a.kind === 'bool' && b.kind === 'bool') {
			return a.value === b.value;
		}
		const pa = asPermutation(a);
		const pb = asPermutation(b);
		if (pa !== undefined && pb !== undefined) {
			return pa.equals(pb);
		}
		if (a.kind === 'pattern' && b.kind === 'pattern') {
			if (a.anyRotation !== b.anyRotation || a.cells.length !== b.cells.length) {
				return false;
			}
			const rotations = a.anyRotation ? a.cells.length : 1;
			for (let k = 0; k < rotations; k++) {
				const rotated = [...a.cells.slice(k), ...a.cells.slice(0, k)];
				if (rotated.every((cell, i) => sameCell(cell, b.cells[i]))) {
					return true;
				}
			}
			return false;
		}
		const kind = (v: Value): string => describeKind(v.kind === 'moves' ? 'permutation' : v.kind);
		throw new RubikonConditionError(`Can't compare ${kind(a)} with ${kind(b)}`, loc);
	}
}

// The permutation a value makes: a permutation, or moves.
function asPermutation(value: Value): Permutation | undefined {
	if (value.kind === 'permutation') {
		return value.perm;
	}
	if (value.kind === 'moves') {
		return movesPermutation(value.moves);
	}
	return undefined;
}

function movesPermutation(moves: Moves): Permutation {
	return permutationOf(engineMoves(moves));
}

// A value bound in the environment, checked as the parser checks literals.
function checkBound(value: Value, name: Name): void {
	if (value.kind === 'pattern') {
		for (const cell of value.cells) {
			if (cell.kind !== 'any' && !isFaceLetter(cell.face)) {
				throw new RubikonConditionError(
					`${name.name} is bound to a pattern with a bad face: ${cell.face}`,
					name.loc
				);
			}
		}
	} else if (value.kind === 'location' && !isLocation(value.name)) {
		throw new RubikonConditionError(`${name.name} is bound to a bad place`, name.loc);
	}
}

function sameCell(a: Cell, b: Cell | undefined): boolean {
	if (b === undefined || a.kind !== b.kind) {
		return false;
	}
	return a.kind === 'any' || (b.kind !== 'any' && a.face === b.face);
}

// The U face as a picture shows it: back row first, each from its U sticker.
const U_PICTURE: readonly (readonly Location[])[] = [
	['ulb', 'ub', 'ubr'],
	['ul', 'u', 'ur'],
	['ufl', 'uf', 'urf']
];
