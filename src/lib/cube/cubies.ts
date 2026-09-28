// The 3D model's pieces: each cubie of the model, with its current
// coordinates, and the turns that move them.

import type { MoveName } from './types';

export { ModelFace, selectCubies, rotateCubies, buildCube, MOVES };
export type { Axis, CubieModel, Selection, ModelTurn, MakeCubie };

type Axis = 'x' | 'y' | 'z';

// Face indexes of the model (not the Face move names in types.ts).
enum ModelFace {
	UP,
	FRONT,
	RIGHT,
	BACK,
	LEFT,
	DOWN
}

// One piece of the model, at its current coordinates (0-based).
interface CubieModel<T> {
	row: number;
	col: number;
	depth: number;
	cubie: T;
}

interface Selection {
	row?: number;
	col?: number;
	depth?: number;
}

// A turn of the model: the cubies selected turn about an axis.
interface ModelTurn {
	axis: Axis;
	turns: number;
	selection: Selection;
}

const MOVES: Readonly<Record<MoveName, ModelTurn>> = {
	x: {
		axis: 'x',
		turns: 1,
		selection: {}
	},
	y: {
		axis: 'y',
		turns: 1,
		selection: {}
	},
	z: {
		axis: 'z',
		turns: 1,
		selection: {}
	},
	R: {
		axis: 'x',
		turns: 1,
		selection: { col: -1 }
	},
	F: {
		axis: 'z',
		turns: 1,
		selection: { depth: 0 }
	},
	U: {
		axis: 'y',
		turns: 1,
		selection: { row: -1 }
	},
	L: {
		axis: 'x',
		turns: -1,
		selection: { col: 0 }
	},
	B: {
		axis: 'z',
		turns: -1,
		selection: { depth: -1 }
	},
	D: {
		axis: 'y',
		turns: -1,
		selection: { row: 0 }
	},
	M: {
		axis: 'x',
		turns: -1,
		selection: { col: 1 }
	},
	E: {
		axis: 'y',
		turns: -1,
		selection: { row: 1 }
	},
	S: {
		axis: 'z',
		turns: 1,
		selection: { depth: 1 }
	}
};

// Transform x,y coordinates (0-based) based on
// the number of 90 degree (clockwise) turns;
function turn(x: number, y: number, turns: number, size: number): [number, number] {
	while (turns < 0) {
		turns += 4;
	}
	while (turns > 0) {
		[x, y] = [y, size - x - 1];
		turns -= 1;
	}
	return [x, y];
}

// Update the meta-data in the cubes list to reflect a rotation.
function rotateCubies<T>(cubies: CubieModel<T>[], axis: Axis, turns: number, size: number): void {
	for (const cubie of cubies) {
		if (axis === 'x') {
			[cubie.depth, cubie.row] = turn(cubie.depth, cubie.row, turns, size);
		} else if (axis === 'y') {
			[cubie.col, cubie.depth] = turn(cubie.col, cubie.depth, turns, size);
		} else if (axis === 'z') {
			[cubie.col, cubie.row] = turn(cubie.col, cubie.row, turns, size);
		}
	}
}

function selectCubies<T>(cubies: CubieModel<T>[], attrs: Selection, size: number): CubieModel<T>[] {
	const selected: CubieModel<T>[] = [];

	for (const cubie of cubies) {
		if (match(attrs, cubie)) {
			selected.push(cubie);
		}
	}

	return selected;

	function match(attrs: Selection, cubie: CubieModel<T>): boolean {
		for (const [attr, index] of Object.entries(attrs) as [keyof Selection, number][]) {
			// Negative indexes count from the far side.
			const value = index < 0 ? index + size : index;
			if (value !== cubie[attr]) {
				return false;
			}
		}
		return true;
	}
}

// Return a list of the visible faces depending on the
// coordinates of the cubie.
function facesOf(row: number, column: number, depth: number, size: number): ModelFace[] {
	const faces: ModelFace[] = [];
	if (row === 0) {
		faces.push(ModelFace.DOWN);
	}
	if (row === size - 1) {
		faces.push(ModelFace.UP);
	}
	if (column === 0) {
		faces.push(ModelFace.LEFT);
	}
	if (column === size - 1) {
		faces.push(ModelFace.RIGHT);
	}
	if (depth === 0) {
		faces.push(ModelFace.FRONT);
	}
	if (depth === size - 1) {
		faces.push(ModelFace.BACK);
	}
	return faces;
}

type MakeCubie<T> = (
	row: number,
	col: number,
	depth: number,
	size: number,
	faces: ModelFace[]
) => T;

// Make a whole cube by enumerating all the cubies
// and adding them to a group.
function buildCube<T>(size: number, makeCubie: MakeCubie<T>): CubieModel<T>[] {
	const cubies: CubieModel<T>[] = [];
	for (let depth = 0; depth < size; depth++) {
		for (let row = 0; row < size; row++) {
			for (let col = 0; col < size; col++) {
				const faces = facesOf(row, col, depth, size);
				if (faces.length === 0) {
					continue;
				}
				const cubie = makeCubie(row, col, depth, size, faces);
				cubies.push({
					row,
					col,
					depth,
					cubie
				});
			}
		}
	}
	return cubies;
}
