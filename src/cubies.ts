export { Face, selectCubies, rotateCubies, buildCube, MOVES };
export type { Axis, Cubie, Selection, Move };

type Axis = 'x' | 'y' | 'z';

// Face indexes
const enum Face {
    UP,
    FRONT,
    RIGHT,
    BACK,
    LEFT,
    DOWN
}

interface Cubie<T> {
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

interface Move {
    axis: Axis;
    turns: number;
    selection: Selection;
}

const MOVES: {[key: string]: Move} = {
    X: {
        axis: 'x',
        turns: 1,
        selection: {},
    },
    Y: {
        axis: 'y',
        turns: 1,
        selection: {},
    },
    Z: {
        axis: 'z',
        turns: 1,
        selection: {},
    },
    R: {
        axis: 'x',
        turns: 1,
        selection: {col: - 1},
    },
    F: {
        axis: 'z',
        turns: 1,
        selection: {depth: 0},
    },
    U: {
        axis: 'y',
        turns: 1,
        selection: {row: - 1},
    },
    L: {
        axis: 'x',
        turns: -1,
        selection: {col: 0},
    },
    B: {
        axis: 'z',
        turns: -1,
        selection: {depth: - 1},
    },
    D: {
        axis: 'y',
        turns: -1,
        selection: {row: 0},
    },
    M: {
        axis: 'x',
        turns: -1,
        selection: {col: 1},
    },
    E: {
        axis: 'y',
        turns: -1,
        selection: {row: 1},
    },
    S: {
        axis: 'z',
        turns: 1,
        selection: {depth: 1},
    },
};

// Transform x,y coordinates (0-based) based on
// the number of 90 degree (clockwise) turns;
function turn(x: number, y: number, turns: number, size: number) {
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
function rotateCubies<T>(cubies: Cubie<T>[], axis: Axis, turns: number, size: number) {
    for (let cubie of cubies) {
        if (axis === 'x') {
            [cubie.depth, cubie.row] = turn(cubie.depth, cubie.row, turns, size);
        } else if (axis === 'y') {
            [cubie.col, cubie.depth] = turn(cubie.col, cubie.depth, turns, size);
        } else if (axis === 'z') {
            [cubie.col, cubie.row] = turn(cubie.col, cubie.row, turns, size);
        }
    }
}

function selectCubies<T>(cubies: Cubie<T>[], attrs: Selection, size: number): Cubie<T>[] {
    const selected: Cubie<T>[] = [];

    for (let cubie of cubies) {
        if (match(attrs, cubie)) {
            selected.push(cubie);
        }
    }

    return selected;

    function match(attrs: Selection, cubie: Cubie<T>): boolean {
        for (let [attr, value] of Object.entries(attrs) as [keyof Cubie<T>, number][]) {
            if (value < 0) {
                value += size;
            }
            if (value !== cubie[attr]) {
                return false;
            }
        }
        return true;
    }
}

// Return a list of the visible faces depending on the
// coordinates of the cubie.
function facesOf(row: number, column:number, depth: number, size: number) {
    const faces = [];
    if (row === 0) {
        faces.push(Face.DOWN)
    }
    if (row === size - 1) {
        faces.push(Face.UP);
    }
    if (column === 0) {
        faces.push(Face.LEFT);
    }
    if (column === size - 1) {
        faces.push(Face.RIGHT);
    }
    if (depth === 0) {
        faces.push(Face.FRONT);
    }
    if (depth === size - 1) {
        faces.push(Face.BACK);
    }
    return faces;
}

type MakeCubie<T> = (row: number, col: number, depth: number, size: number, faces: Face[]) => T;

// Make a whole cube by enumerating all the cubies
// and adding them to a group.
function buildCube<T>(size: number, makeCubie: MakeCubie<T>): Cubie<T>[] {
    const cubies: Cubie<T>[] = [];
    for (let depth = 0; depth < size; depth++) {
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const faces = facesOf(row, col, depth, size);
                if (faces.length === 0) {
                    continue;
                }
                const cubie = makeCubie(row, col, depth, size, faces);
                cubies.push({
                    row, col, depth, cubie
                })
            }
        }
    }
    return cubies;
}