// The Basic Modern Solution: the simple layer-by-layer solution most people
// learn today, as written in Mike's notes (see the page for the original).
//
// It uses the same kind of rules as the 2003 Singmaster solver: turn the
// cube (or a face) with a "generator" move until a piece reaches a known
// place, then apply the sequence for that place.  The sequences are written
// here in standard notation, as in Mike's notes; "P" undoes the generator.

import { Permutation } from './permutation';
import { applyMoves, invertMoves, parseMoves, permutationOf, type Move } from './moves';
import type { MoveList } from './move-list';
import {
	rotatePattern,
	solveVia,
	topEdgePattern,
	type Place,
	type Rule,
	type TopEdgePattern
} from './singmaster';
import {
	rotateName,
	type Cube,
	type Cubie,
	type Location,
	type MoveToken,
	type Notation
} from './types';

// The sequences from Mike's notes.
export const SEQUENCES = {
	insertRight: "U R U' R' U' F' U F",
	insertLeft: "U' L' U L U F U' F'",
	topCross: "F R U R' U' F'",
	swapEdges: "R U R' U R U2 R' U",
	cycleCorners: "U R U' L' U R' U' L",
	cycleCornersBack: "U' L' U R U' L U R'",
	twistCorner: "R' D' R D R' D' R D",
	twistCornerBack: "D' R' D R D' R' D R"
} as const satisfies Record<string, Notation>;

const S = SEQUENCES;

const WHOLE_CUBE_TURN: MoveToken = 'y';
const WHOLE_CUBE_TURN_BACK: MoveToken = "y'";
const TURN = parseMoves(WHOLE_CUBE_TURN);
const U = parseMoves('U');

// A place for an edge or corner, ignoring which way the piece in it faces:
// named by the piece whose home it is (e.g. "db" for bd).
type EdgeSlot = 'uf' | 'ur' | 'ub' | 'ul' | 'df' | 'dr' | 'db' | 'dl' | 'fr' | 'fl' | 'br' | 'bl';
type CornerSlot = 'ufl' | 'ulb' | 'ubr' | 'urf' | 'dlf' | 'dfr' | 'drb' | 'dbl';
type Slot = EdgeSlot | CornerSlot;

const SLOTS: ReadonlySet<Location> = new Set<Slot>([
	'uf',
	'ur',
	'ub',
	'ul',
	'df',
	'dr',
	'db',
	'dl',
	'fr',
	'fl',
	'br',
	'bl',
	'ufl',
	'ulb',
	'ubr',
	'urf',
	'dlf',
	'dfr',
	'drb',
	'dbl'
]);

function isSlot(place: Location): place is Slot {
	return SLOTS.has(place);
}

// The slot of an edge or corner place.
function slot(place: Location): Slot {
	let loc = place;
	for (let rot = 0; rot < place.length; rot++) {
		if (isSlot(loc)) {
			return loc;
		}
		loc = rotateName(loc);
	}
	throw new Error(`Not an edge or corner: ${place}`);
}

// Where a piece must be for moves to put it in its place.
function placeFor(moves: Notation, piece: Cubie): Location {
	return permutationOf(invertMoves(parseMoves(moves))).apply(piece);
}

// Putting a piece down from above its place, for each way it can face.
function downRules(piece: Cubie, sequences: Notation[]): Rule[] {
	return [['U', sequences.map((moves): [Place, Notation] => [placeFor(moves, piece), moves])]];
}

// The bottom front edge, from the top front.
const EDGE_DOWN = downRules('df', ['F2', "U' R' F R"]);

// The bottom front right corner, from the top front right.
const CORNER_DOWN = downRules('dfr', ["R U R'", "F' U' F", "R U2 R' U' R U R'"]);

// Moving a piece to the top from a place on the bottom or in the middle,
// without disturbing the other pieces on the bottom.
type KickOut = Partial<Record<Slot, Notation>>;

const EDGE_OUT: KickOut = {
	df: 'F2',
	dr: 'R2',
	db: 'B2',
	dl: 'L2',
	fr: "R U R'",
	br: "R' U R",
	bl: "L U L'",
	fl: "L' U L"
};

const CORNER_OUT: KickOut = {
	dfr: "R U R'",
	drb: "R' U' R",
	dbl: "L U L'",
	dlf: "L' U' L"
};

const TOP_CORNERS: Cubie[] = ['ulb', 'ubr', 'urf', 'ufl'];

export class Beginner {
	private perm: Cube = new Permutation();

	constructor(private moveList: MoveList) {}

	private move(moves: Move[]): void {
		this.moveList.add(moves);
		this.perm = applyMoves(this.perm, moves);
	}

	solve(perm: Cube): void {
		const block = this.moveList.openBlock('Basic Modern Solution');
		this.perm = perm;

		this.solveFirstFace();
		this.solveMiddle();
		this.solveTopCross();
		this.placeTopEdges();
		this.placeTopCorners();
		this.twistTopCorners();

		block.close();
	}

	// The first face isn't in Mike's notes ("obvious").  It's solved with the
	// white face down, as it's held for the rest of the solution: bring each
	// piece to the top, turn the top until it's over its place, and put it
	// down.  A piece stuck in the wrong place on the bottom (or in the middle)
	// is first moved up to the top.
	private solveFirstFace(): void {
		const face: Cubie[] = ['df', 'dr', 'db', 'dl', 'dfr', 'drb', 'dbl', 'dlf'];
		if (face.every((piece) => this.perm.apply(piece) === piece)) {
			return;
		}
		const block = this.moveList.openBlock('First Face (White)');
		const edges = this.moveList.openBlock('Bottom Edges');
		for (let i = 0; i < 4; i++) {
			this.placeBottomPiece('df', EDGE_OUT, EDGE_DOWN);
			this.move(TURN);
		}
		edges.close();
		const corners = this.moveList.openBlock('Bottom Corners');
		for (let i = 0; i < 4; i++) {
			this.placeBottomPiece('dfr', CORNER_OUT, CORNER_DOWN);
			this.move(TURN);
		}
		corners.close();
		block.close();
	}

	private placeBottomPiece(piece: Cubie, out: KickOut, down: Rule[]): void {
		const at = this.perm.apply(piece);
		if (at === piece) {
			return;
		}
		if (!at.includes('u')) {
			const moves = out[slot(at)];
			if (moves === undefined) {
				throw new Error(`No way to move ${piece} out of ${at}`);
			}
			this.move(parseMoves(moves));
		}
		this.move(solveVia(this.perm, piece, down) ?? []);
	}

	// Middle edges: turn the top until the edge for the front-right slot is
	// on top, with its front color facing front (insert right) or its right
	// color facing right (turn the cube and insert left).
	private solveMiddle(): void {
		// An edge stuck in the wrong slot of the middle layer: turn that slot to
		// the front right, and insert any edge there to move it to the top.
		const kickOut = (turns: Notation, back: Notation): Notation =>
			`${turns} ${S.insertRight} ${back}`;
		const y = WHOLE_CUBE_TURN;
		const yBack = WHOLE_CUBE_TURN_BACK;
		const stuck: Rule[] = [
			[
				'',
				[
					['rf', S.insertRight],
					['br', kickOut(y, yBack)],
					['rb', kickOut(y, yBack)],
					['bl', kickOut(`${y} ${y}`, `${yBack} ${yBack}`)],
					['lb', kickOut(`${y} ${y}`, `${yBack} ${yBack}`)],
					['fl', kickOut(yBack, y)],
					['lf', kickOut(yBack, y)]
				]
			]
		];
		const rules: Rule[] = [
			[
				'U',
				[
					['fu', S.insertRight],
					['ur', `${WHOLE_CUBE_TURN} ${S.insertLeft} ${WHOLE_CUBE_TURN_BACK}`]
				]
			]
		];

		const block = this.moveList.openBlock('Middle');
		for (let i = 0; i < 4; i++) {
			const at = this.perm.apply('fr');
			if (at !== 'fr' && !at.includes('u')) {
				// In the middle layer, in the wrong place: move it to the top.
				this.move(solveVia(this.perm, 'fr', stuck) ?? []);
			}
			if (this.perm.apply('fr') !== 'fr') {
				this.move(solveVia(this.perm, 'fr', rules) ?? []);
			}
			this.move(TURN);
		}
		block.close();
	}

	// Top cross: dot, L, line, cross, each with F (R U R' U') F'.
	private solveTopCross(): void {
		const cases: Partial<Record<TopEdgePattern, Notation>> = {
			UUUU: '',
			XUXU: S.topCross, // line, left to right
			XXUU: S.topCross, // L, at the back and left
			XXXX: S.topCross // dot
		};

		const block = this.moveList.openBlock('Top Cross');
		for (let tries = 0; tries < 4; tries++) {
			// Which top edges have their top color up (F, R, B, L).
			const up = topEdgePattern(this.perm);
			if (up === 'UUUU') {
				break;
			}
			for (let turns = 0; turns < 4; turns++) {
				const sequence = cases[rotatePattern(up, turns)];
				if (sequence !== undefined) {
					this.move([
						...Array.from({ length: turns }, (): Move[] => U).flat(),
						...parseMoves(sequence)
					]);
					break;
				}
			}
		}
		block.close();
	}

	// Top edges: turn the top until two edges are in place.  If they are next
	// to each other (at the back and right), swap the front and left edges.
	private placeTopEdges(): void {
		const rules: Rule[] = [
			[
				'U',
				[
					// Already in place.
					[['uf', 'uf', '', 'ur', 'ur', '', 'ub', 'ub', '', 'ul', 'ul'], ''],
					[['uf', 'ul', 'uf', '', 'ub', 'ub', '', 'ur', 'ur'], S.swapEdges],
					// Edges across from each other: swap, then try again.
					[['uf', 'ub', 'uf', '', 'ul', 'ul', '', 'ur', 'ur'], S.swapEdges]
				]
			]
		];

		const block = this.moveList.openBlock('Top Edges');
		for (let tries = 0; tries < 3; tries++) {
			let moves: Move[] | undefined;
			for (let j = 0; j < 4; j++) {
				moves = solveVia(this.perm, '', rules);
				if (moves !== undefined) {
					break;
				}
				this.move(TURN);
			}
			// Stop if no rule matched, or the edges were already in place.
			if (moves === undefined || moves.length === 0) {
				break;
			}
			this.move(moves);
			if (this.topEdgesSolved()) {
				break;
			}
		}
		block.close();
	}

	private topEdgesSolved(): boolean {
		return (['uf', 'ur', 'ub', 'ul'] as const).every((edge) => this.perm.apply(edge) === edge);
	}

	// Top corners: find a corner in its place (maybe twisted), and cycle the
	// other three around it.  If none is in place, cycle any three first.
	private placeTopCorners(): void {
		const rules: Rule[] = [
			[
				WHOLE_CUBE_TURN,
				[
					[['ubr', 'ulb', 'ufl', 'ubr'], S.cycleCorners],
					[['ulb', 'ubr', 'urf', 'ulb'], S.cycleCornersBack]
				]
			]
		];

		const block = this.moveList.openBlock('Top Corners');
		for (let tries = 0; tries < 3 && !this.topCornersPlaced(); tries++) {
			const moves = solveVia(this.cornerPlaces(), '', rules);
			this.move(moves?.length ? moves : parseMoves(S.cycleCorners));
		}
		block.close();
	}

	// For each place on top, the corner in it (ignoring twist).
	private cornerPlaces(): Cube {
		const map = new Permutation();
		for (const corner of TOP_CORNERS) {
			let place = this.perm.apply(corner);
			while (place.charAt(0) !== 'u') {
				place = rotateName(place);
			}
			map.addMap(place, corner);
		}
		return map;
	}

	private topCornersPlaced(): boolean {
		return TOP_CORNERS.every((corner) => {
			const at = this.perm.apply(corner);
			return at === corner || at === rotateName(corner) || at === rotateName(rotateName(corner));
		});
	}

	// Twist corners: with the corner to twist at the front right, repeat
	// (R' D' R D) or (D' R' D R) until it's right, then turn the top (not the
	// cube) to the next corner.
	private twistTopCorners(): void {
		const rules: Rule[] = [
			[
				'',
				[
					['rfu', S.twistCorner],
					['fur', S.twistCornerBack],
					['urf', '']
				]
			]
		];

		const block = this.moveList.openBlock('Twist Corners');
		for (let i = 0; i < 4; i++) {
			// The corner now at the front right.
			let corner = this.perm.inverse().apply('urf');
			while (corner.charAt(0) !== 'u') {
				corner = rotateName(corner);
			}
			this.move([...(solveVia(this.perm, corner, rules) ?? []), ...U]);
		}
		block.close();
	}
}
