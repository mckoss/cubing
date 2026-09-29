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

// A value a name can be bound to (a parameter, a `let`).
export type Value =
	| { kind: 'pattern'; cells: readonly Cell[]; anyRotation: boolean }
	| { kind: 'location'; name: Location }
	| { kind: 'permutation'; perm: Permutation };

// Resolves names: `p` in `algo lift(p: Pattern)`, bound by the caller.
// Undefined means the name isn't bound.
export type Env = (name: Name) => Value | undefined;

// No names bound.
export const EMPTY_ENV: Env = () => undefined;

// An Env from a record of names ("p", or "cfop.p" for a module's name).
export function envOf(values: Readonly<Record<string, Value>>): Env {
	const map = new Map(Object.entries(values));
	return (name) => map.get(name.module === null ? name.name : `${name.module}.${name.name}`);
}

// An error evaluating a condition, with where the node is in the source.
export class RubikonConditionError extends Error {
	readonly line: number;
	readonly column: number;

	constructor(message: string, loc: Loc) {
		super(`${loc.line}:${loc.column}: ${message}`);
		this.name = 'RubikonConditionError';
		this.line = loc.line;
		this.column = loc.column;
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
// bound to parameters); the name `cube`, unless bound, is the state.
export function evaluateCondition(cond: Cond, state: Permutation, env: Env = EMPTY_ENV): boolean {
	return new Evaluator(new CubeView(state), env).cond(cond);
}

class Evaluator {
	constructor(
		private readonly cube: CubeView,
		private readonly env: Env
	) {}

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
				`Not yet: \`is\` needs a pattern, not a ${pattern.kind}`,
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

	// A value used as a condition: solved(…), placed(…).
	private test(value: Expr): boolean {
		if (value.kind !== 'call' || value.module !== null) {
			throw new RubikonConditionError('Not a condition', value.loc);
		}
		switch (value.name) {
			case 'solved':
				return this.solved(value);
			case 'placed':
				return this.places(value).every((place) => this.cube.isHome(place, true));
			default:
				throw new RubikonConditionError(`Not yet: ${value.name}(…) as a condition`, value.loc);
		}
	}

	// solved(cube), or solved(places…).
	private solved(call: Call): boolean {
		const [arg] = call.args;
		if (call.args.length === 1 && arg !== undefined && this.isCube(arg)) {
			return PIECES.every((piece) => this.cube.isHome(piece, false));
		}
		return this.places(call).every((place) => this.cube.isHome(place, false));
	}

	private isCube(expr: Expr): boolean {
		return (
			expr.kind === 'name' &&
			expr.module === null &&
			expr.name === 'cube' &&
			this.env(expr) === undefined
		);
	}

	// The places a call's one argument names: places, layers, or a mix.
	private places(call: Call): Location[] {
		const [arg] = call.args;
		if (call.args.length !== 1 || arg === undefined) {
			throw new RubikonConditionError(`${call.name}() takes one list of places`, call.loc);
		}
		return this.placesOf(arg);
	}

	private placesOf(expr: Expr): Location[] {
		if (expr.kind === 'seq') {
			return expr.items.flatMap((item) => this.placesOf(item));
		}
		if (expr.kind === 'call' && expr.module === null && expr.name === 'layer') {
			const [face] = expr.args;
			if (
				expr.args.length !== 1 ||
				face === undefined ||
				face.kind !== 'move' ||
				face.turns !== 1
			) {
				throw new RubikonConditionError('layer() takes a face: layer(D)', expr.loc);
			}
			return layerPlaces(face.name, face.loc);
		}
		return [this.location(expr)];
	}

	private location(expr: Expr): Location {
		const value = this.value(expr);
		if (value.kind !== 'location') {
			throw new RubikonConditionError(`Expected a place, not a ${value.kind}`, expr.loc);
		}
		return value.name;
	}

	// The value of an expression, as far as conditions need them.
	private value(expr: Expr): Value {
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
				const bound = this.env(expr);
				if (bound !== undefined) {
					checkBound(bound, expr);
					return bound;
				}
				if (this.isCube(expr)) {
					return { kind: 'permutation', perm: this.cube.state };
				}
				const qualified = expr.module === null ? expr.name : `${expr.module}.${expr.name}`;
				throw new RubikonConditionError(`Unknown name: ${qualified}`, expr.loc);
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
				return { kind: 'permutation', perm: Permutation.identity() };
			case 'seq': {
				// Cycles side by side: one after another.
				let perm = Permutation.identity();
				for (const item of expr.items) {
					const value = this.value(item);
					if (value.kind !== 'permutation') {
						throw new RubikonConditionError(
							`Expected a permutation, not a ${value.kind}`,
							item.loc
						);
					}
					perm = perm.compose(value.perm);
				}
				return { kind: 'permutation', perm };
			}
			default:
				throw new RubikonConditionError(
					`Not yet: a ${expr.kind} in a condition (needs the moves evaluator)`,
					expr.loc
				);
		}
	}

	private parseCycles(text: string, loc: Loc): Permutation {
		try {
			return Permutation.parse(text);
		} catch (e) {
			throw new RubikonConditionError(e instanceof Error ? e.message : String(e), loc);
		}
	}

	// `==`: same place and facing, same pattern (a cubie with its
	// orientation; with /r, the same up to rotation), or same permutation.
	// Values of different kinds are an error.
	private equals(a: Value, b: Value, loc: Loc): boolean {
		if (a.kind === 'location' && b.kind === 'location') {
			return a.name === b.name;
		}
		if (a.kind === 'permutation' && b.kind === 'permutation') {
			return a.perm.equals(b.perm);
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
		throw new RubikonConditionError(`Can't compare a ${a.kind} with a ${b.kind}`, loc);
	}
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
