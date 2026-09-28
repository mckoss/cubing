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

import { rotateName, type Location } from './types';

export { Permutation };

// A path of places for Permutation.hasMap; '' starts a new path.
export type Path = (Location | '')[];

// Suffixes for cycles that return a piece rotated (twisted or flipped).
const ROTATION_SUFFIX = ['', '+', '-'] as const;

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
		for (let i = 0; i < cycle.length; i++) {
			this.addMap(cycle[i], cycle[(i + 1) % cycle.length]);
		}
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
	toString(): string {
		const marked = new Set<Location>();
		const mark = (loc: Location): void => {
			for (let rot = 0; rot < loc.length; rot++) {
				marked.add(loc);
				loc = rotateName(loc);
			}
		};

		const cycles: string[] = [];
		for (const init of this.map.keys()) {
			if (marked.has(init)) {
				continue;
			}
			let cycle = '(' + init;
			mark(init);
			let elem = this.apply(init);
			while (!marked.has(elem)) {
				cycle += ' ' + elem;
				mark(elem);
				elem = this.apply(elem);
			}
			cycle += ')' + ROTATION_SUFFIX[rotationsBetween(init, elem) ?? 0];
			cycles.push(cycle);
		}
		return cycles.length === 0 ? '()' : cycles.join(' ');
	}
}
