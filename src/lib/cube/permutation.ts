// Permutations of the stickers of a cube.
//
// Ported from the 2003 Rubik's Cube Simulator (mckoss.com/jscript/Rubik).
//
// Each piece of the cube is named by the faces it touches, read clockwise:
// "UFL" is the corner touching the Up, Front, and Left faces, and "FLU" and
// "LUF" name the same corner, starting from a different sticker.  "UF" is an
// edge, and "U" is the center of the Up face.  A permutation maps a sticker
// to the place it moves to.  Only one rotation of each piece needs to be
// stored; the others are found by rotating the name.
//
// The constructor takes a list of cycles.  E.g.:
// (a b c)(d e) -> new Permutation([["a", "b", "c"], ["d", "e"]]);

export { Permutation };

// Suffixes for cycles that return a piece rotated (twisted or flipped).
const ROTATION_SUFFIX = ['', '+', '-'];

function rotate(st: string): string {
	return st.substring(1) + st.charAt(0);
}

// How many times st1 must be rotated to equal st2 (or undefined if never).
function rotationsBetween(st1: string, st2: string): number | undefined {
	for (let rot = 0; rot < st1.length; rot++) {
		if (st1 === st2) {
			return rot;
		}
		st1 = rotate(st1);
	}
	return undefined;
}

class Permutation {
	private map = new Map<string, string>();

	constructor(cycles: string[][] = []) {
		for (const cycle of cycles) {
			this.addCycle(cycle);
		}
	}

	static identity(): Permutation {
		return new Permutation();
	}

	addMap(from: string, to: string) {
		if (from !== to) {
			this.map.set(from, to);
		}
	}

	private addCycle(cycle: string[]) {
		for (let i = 1; i < cycle.length; i++) {
			this.addMap(cycle[i - 1], cycle[i]);
		}
		this.addMap(cycle[cycle.length - 1], cycle[0]);
	}

	// Where the sticker (or piece) named `from` is moved to.
	apply(from: string): string {
		for (let rot = 0; rot < from.length; rot++) {
			const to = this.map.get(from);
			if (to !== undefined) {
				const back = from.length - rot;
				return to.substring(back) + to.substring(0, back);
			}
			from = rotate(from);
		}
		return from;
	}

	// This permutation followed by p2.
	compose(p2: Permutation): Permutation {
		const result = new Permutation();

		for (const st of this.map.keys()) {
			result.addMap(st, p2.apply(this.apply(st)));
		}
		for (const st of p2.map.keys()) {
			if (this.apply(st) === st) {
				result.addMap(st, p2.apply(st));
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
		for (const st of this.map.keys()) {
			result.addMap(this.apply(st), st);
		}
		return result;
	}

	// Does this permutation move pieces along the given path?  E.g.
	// ["UF", "UR", "UB"] means the piece at UF goes to UR, and the one at UR
	// goes to UB.  An empty string starts a new path.
	hasMap(path: string[]): boolean {
		let loc = '';
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
		return this.toString() === '<Identity>';
	}

	equals(p2: Permutation): boolean {
		return this.compose(p2.inverse()).isIdentity();
	}

	// Cycle notation, e.g. "(UF UR UB) (URF)+".  A "+" or "-" means the
	// pieces in the cycle come back rotated (clockwise or counterclockwise).
	toString(): string {
		const marked = new Set<string>();
		const mark = (st: string) => {
			for (let rot = 0; rot < st.length; rot++) {
				marked.add(st);
				st = rotate(st);
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
		return cycles.length === 0 ? '<Identity>' : cycles.join(' ');
	}
}
