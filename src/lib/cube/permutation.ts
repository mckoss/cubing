// Permutations of the stickers of a cube.
//
// Ported from the 2003 Rubik's Cube Simulator (mckoss.com/jscript/Rubik).
//
// Each piece of the cube is named by the faces it touches, read clockwise:
// "ufl" is the corner touching the up, front, and left faces, and "flu" and
// "luf" name the same corner, starting from a different sticker.  "uf" is an
// edge, and "u" is the center of the up face.  A permutation maps a sticker
// to the place it moves to.  Only one rotation of each piece needs to be
// stored; the others are found by rotating the name.
//
// The constructor takes a list of cycles.  E.g.:
// (a b c)(d e) -> new Permutation([["a", "b", "c"], ["d", "e"]]);

import { LOCATIONS, parseLocation, rotateName, type Location } from './types';

export { Permutation };

// A path of places for Permutation.hasMap; '' starts a new path.
export type Path = (Location | '')[];

// Suffixes for cycles that return a piece rotated (twisted or flipped).
const ROTATION_SUFFIX: readonly string[] = ['', '+', '-'];

// Every piece, in the order cycles are printed: the U layer (edges, then
// corners), the D layer, the middle layer, and the centers.
const PIECE_ORDER: readonly Location[] = [
	'uf',
	'ur',
	'ub',
	'ul',
	'urf',
	'ufl',
	'ulb',
	'ubr',
	'df',
	'dr',
	'db',
	'dl',
	'dfr',
	'dlf',
	'dbl',
	'drb',
	'fr',
	'fl',
	'br',
	'bl',
	'u',
	'd',
	'f',
	'b',
	'l',
	'r'
];

// Each location's piece, as named in PIECE_ORDER: HOME.get('rfu') is 'urf'.
const HOME: ReadonlyMap<Location, Location> = new Map(
	LOCATIONS.map((loc) => [
		loc,
		PIECE_ORDER.find((piece) => rotationsBetween(piece, loc) !== undefined) ?? loc
	])
);

function homeOf(loc: Location): Location {
	return HOME.get(loc) ?? loc;
}

function rotate(loc: Location, times: number): Location {
	for (let i = 0; i < times; i++) {
		loc = rotateName(loc);
	}
	return loc;
}

// How well a name reads: best from the U or D face, then (for a middle
// edge) from F or B.
function readability(loc: Location): number {
	const face = loc.charAt(0);
	if (face === 'u' || face === 'd') {
		return 2;
	}
	return loc.length === 2 && (face === 'f' || face === 'b') ? 1 : 0;
}

// The spelling of a cycle to print.  The same cycle can be written from
// any of its pieces, and with every name rotated alike; choose the one
// with the most names read from U or D (F or B for middle edges), then one
// whose first name is, then the one starting from the earliest piece.
// `names` is the cycle as found, and `turns` how far its first piece comes
// back rotated.
function spellCycle(names: Location[], turns: number): string {
	let best: Location[] = names;
	let bestScore = -Infinity;
	const length = names[0]?.length ?? 1;
	for (let k = 0; k < length; k++) {
		const rotated = names.map((loc) => rotate(loc, k));
		for (let i = 0; i < rotated.length; i++) {
			// Starting later in the cycle, the names passed come back rotated.
			const spelling = [
				...rotated.slice(i),
				...rotated.slice(0, i).map((loc) => rotate(loc, turns))
			];
			const first = spelling[0] ?? names[0];
			if (first === undefined) {
				continue;
			}
			const score =
				spelling.reduce((sum, loc) => sum + readability(loc), 0) * 1000 +
				readability(first) * 100 -
				PIECE_ORDER.indexOf(homeOf(first));
			if (score > bestScore) {
				best = spelling;
				bestScore = score;
			}
		}
	}
	return '(' + best.join(' ') + ')' + (ROTATION_SUFFIX[turns] ?? '');
}

// How many times a must be rotated to equal b (or undefined if never).
function rotationsBetween(a: Location, b: Location): number | undefined {
	for (let rot = 0; rot < a.length; rot++) {
		if (a === b) {
			return rot;
		}
		a = rotateName(a);
	}
	return undefined;
}

class Permutation {
	private map = new Map<Location, Location>();

	constructor(cycles: Location[][] = []) {
		for (const cycle of cycles) {
			this.addCycle(cycle);
		}
	}

	static identity(): Permutation {
		return new Permutation();
	}

	addMap(from: Location, to: Location): void {
		if (from !== to) {
			this.map.set(from, to);
		}
	}

	private addCycle(cycle: Location[]): void {
		cycle.forEach((from, i) => {
			const to = cycle[(i + 1) % cycle.length];
			if (to === undefined) {
				throw new Error(`Bad cycle: ${cycle.join(' ')}`);
			}
			this.addMap(from, to);
		});
	}

	// Where the sticker (or piece) named `from` is moved to.
	apply(from: Location): Location {
		for (let rot = 0; rot < from.length; rot++) {
			const to = this.map.get(from);
			if (to !== undefined) {
				const back = from.length - rot;
				return (to.substring(back) + to.substring(0, back)) as Location;
			}
			from = rotateName(from);
		}
		return from;
	}

	// This permutation followed by p2.
	compose(p2: Permutation): Permutation {
		const result = new Permutation();

		for (const loc of this.map.keys()) {
			result.addMap(loc, p2.apply(this.apply(loc)));
		}
		for (const loc of p2.map.keys()) {
			if (this.apply(loc) === loc) {
				result.addMap(loc, p2.apply(loc));
			}
		}
		return result;
	}

	power(n: number): Permutation {
		let result = new Permutation();
		for (let i = 0; i < n; i++) {
			result = result.compose(this);
		}
		return result;
	}

	inverse(): Permutation {
		const result = new Permutation();
		for (const loc of this.map.keys()) {
			result.addMap(this.apply(loc), loc);
		}
		return result;
	}

	// Does this permutation move pieces along the given path?  E.g.
	// ["uf", "ur", "ub"] means the piece at uf goes to ur, and the one at ur
	// goes to ub.  An empty string starts a new path.
	hasMap(path: Path): boolean {
		let loc: Location | '' = '';
		for (const next of path) {
			if (next === '') {
				loc = '';
			} else if (loc === '') {
				loc = next;
			} else {
				loc = this.apply(loc);
				if (loc !== next) {
					return false;
				}
			}
		}
		return true;
	}

	isIdentity(): boolean {
		return this.toString() === '()';
	}

	equals(p2: Permutation): boolean {
		return this.compose(p2.inverse()).isIdentity();
	}

	// Cycle notation, e.g. "(uf ur ub) (urf)+", or "()" for the identity.  A
	// "+" or "-" means the pieces in the cycle come back rotated (clockwise
	// or counterclockwise).
	// The same permutation always prints the same way (see spellCycle), and
	// the text can be read back with Permutation.parse.
	toString(): string {
		const done = new Set<Location>();
		const cycles: string[] = [];
		for (const piece of PIECE_ORDER) {
			if (done.has(piece) || this.apply(piece) === piece) {
				continue;
			}
			const names: Location[] = [piece];
			done.add(piece);
			let loc = this.apply(piece);
			while (homeOf(loc) !== piece) {
				names.push(loc);
				done.add(homeOf(loc));
				loc = this.apply(loc);
			}
			cycles.push(spellCycle(names, rotationsBetween(piece, loc) ?? 0));
		}
		return cycles.length === 0 ? '()' : cycles.join(' ');
	}

	// Read cycle notation, as toString writes it: "(uf ur ub) (urf)+", or
	// "()" for the identity.  Corners must be named clockwise.
	static parse(text: string): Permutation {
		const result = new Permutation();
		const trimmed = text.trim();
		if (trimmed === '()') {
			return result;
		}
		const cycle = /\(([a-z]+(?: [a-z]+)*)\)([+-]?)\s*/y;
		let match: RegExpExecArray | null;
		while (cycle.lastIndex < trimmed.length && (match = cycle.exec(trimmed)) !== null) {
			const names = (match[1] ?? '').split(' ').map(parseLocation);
			const turns = ROTATION_SUFFIX.indexOf(match[2] ?? '');
			names.forEach((from, i) => {
				const next = names[i + 1];
				const first = names[0];
				if (first !== undefined) {
					result.addMap(from, next ?? rotate(first, turns));
				}
			});
		}
		if (cycle.lastIndex !== trimmed.length || trimmed.length === 0) {
			throw new Error(`Not cycle notation: ${text}`);
		}
		return result;
	}
}
