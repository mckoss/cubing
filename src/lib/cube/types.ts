// Semantic types for the cube.
//
// Names are plain strings at run time, but each type lists every valid
// name, so a misspelled name is a compile error.  Pieces and places are
// named in lower case, moves in standard notation (upper case faces).

import type { Permutation } from './permutation';

// A face, as a letter of a location or cubie name.
export type FaceLetter = 'u' | 'd' | 'f' | 'b' | 'l' | 'r';

// A place on the cube, including which way the piece in it faces: the
// piece's first sticker is on the face of the first letter.  Corners are
// named clockwise, so "ufl", "flu", and "luf" are the same corner place,
// starting from a different sticker.
export type CenterLocation = FaceLetter;

export type EdgeLocation =
	| 'uf'
	| 'fu'
	| 'ur'
	| 'ru'
	| 'ub'
	| 'bu'
	| 'ul'
	| 'lu'
	| 'df'
	| 'fd'
	| 'dr'
	| 'rd'
	| 'db'
	| 'bd'
	| 'dl'
	| 'ld'
	| 'fr'
	| 'rf'
	| 'fl'
	| 'lf'
	| 'br'
	| 'rb'
	| 'bl'
	| 'lb';

export type CornerLocation =
	| 'ufl'
	| 'flu'
	| 'luf'
	| 'ulb'
	| 'lbu'
	| 'bul'
	| 'ubr'
	| 'bru'
	| 'rub'
	| 'urf'
	| 'rfu'
	| 'fur'
	| 'dlf'
	| 'lfd'
	| 'fdl'
	| 'dfr'
	| 'frd'
	| 'rdf'
	| 'drb'
	| 'rbd'
	| 'bdr'
	| 'dbl'
	| 'bld'
	| 'ldb';

export type Location = CenterLocation | EdgeLocation | CornerLocation;

// A piece of the cube, named by its home location.  Any rotation of the
// name is the same piece, read from a different sticker.
export type Cubie = Location;

// A whole cube's state: the permutation that takes a solved cube to it.
export type Cube = Permutation;

// Moves, in standard notation.
export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Slice = 'M' | 'E' | 'S';
export type Rotation = 'x' | 'y' | 'z';
export type MoveName = Face | Slice | Rotation;

// A quarter turn clockwise (1), half turn (2), or quarter turn
// counterclockwise (3).
export type Turns = 1 | 2 | 3;

export interface Move {
	name: MoveName;
	turns: Turns;
}

// One move written in standard notation, e.g. "R", "U2", or "F'".
export type MoveToken = `${MoveName}${'' | '2' | "'"}`;

// A sequence of moves written in standard notation, e.g. "R U R' U'"
// (parse it with parseMoves).  Any string is allowed here, so prefer
// Move[] for values that have been parsed.
export type Notation = string;

export const FACE_LETTERS: readonly FaceLetter[] = ['u', 'd', 'f', 'b', 'l', 'r'];

const EDGES = ['uf', 'ur', 'ub', 'ul', 'df', 'dr', 'db', 'dl', 'fr', 'fl', 'br', 'bl'] as const;
const CORNERS = ['ufl', 'ulb', 'ubr', 'urf', 'dlf', 'dfr', 'drb', 'dbl'] as const;

// The first letter moved to the end: the same place, from the next sticker.
export function rotateName<T extends Location>(name: T): T {
	return (name.substring(1) + name.charAt(0)) as T;
}

// Every location name (54 stickers).
export const LOCATIONS: readonly Location[] = [
	...FACE_LETTERS,
	...EDGES.flatMap((e) => [e, rotateName(e)]),
	...CORNERS.flatMap((c) => [c, rotateName(c), rotateName(rotateName(c))])
];

const LOCATION_SET: ReadonlySet<string> = new Set(LOCATIONS);

export function isLocation(name: string): name is Location {
	return LOCATION_SET.has(name);
}

// Check a name read from text.
export function parseLocation(name: string): Location {
	if (!isLocation(name)) {
		throw new Error(`Not a location: ${name}`);
	}
	return name;
}
