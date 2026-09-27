// The Basic Modern Solution: the simple layer-by-layer solution most people
// learn today, as written in Mike's notes (see the page for the original).
//
// It uses the same kind of rules as the 2003 Singmaster solver: turn the
// cube (or a face) with a "generator" move until a piece reaches a known
// place, then apply the sequence for that place.  The sequences are written
// here in standard notation, as in Mike's notes; "P" undoes the generator.

import { Permutation } from './permutation';
import { apply2003, parseMoves, to2003Notation } from './moves';
import type { MoveList } from './move-list';
import { Singmaster, solveVia, type Rule } from './singmaster';

// Convert a sequence in standard notation to the 2003 notation the rules
// use, keeping any "P".
function seq(st: string): string {
	return st
		.split('P')
		.map((part) => to2003Notation(parseMoves(part)))
		.join('P');
}

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
} as const;

const S = Object.fromEntries(
	Object.entries(SEQUENCES).map(([name, moves]) => [name, seq(moves)])
) as Record<keyof typeof SEQUENCES, string>;

const WHOLE_CUBE_TURN = seq('y');
const WHOLE_CUBE_TURN_BACK = seq("y'");

function rotate(st: string, n: number): string {
	return st.substring(n) + st.substring(0, n);
}

export class Beginner {
	private perm!: Permutation;

	constructor(private moveList: MoveList) {}

	private move(moves: string) {
		this.moveList.appendMoves(moves);
		this.perm = apply2003(this.perm, moves);
	}

	solve(perm: Permutation) {
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

	// The first face (white, on the bottom) isn't in Mike's notes ("obvious");
	// this turns the cube over and uses the Singmaster solver's first layer.
	private solveFirstFace() {
		const face = ['DF', 'DR', 'DB', 'DL', 'DFR', 'DRB', 'DBL', 'DLF'];
		if (face.every((piece) => this.perm.apply(piece) === piece)) {
			return;
		}
		const block = this.moveList.openBlock('First Face (White)');
		this.move('kk');
		this.perm = new Singmaster(this.moveList).solveFirstLayer(this.perm);
		this.move('kk');
		block.close();
	}

	// Middle edges: turn the top until the edge for the front-right slot is
	// on top, with its front color facing front (insert right) or its right
	// color facing right (turn the cube and insert left).
	private solveMiddle() {
		// An edge stuck in the wrong slot of the middle layer: turn that slot to
		// the front right, and insert any edge there to move it to the top.
		const kickOut = (turns: string, back: string) => turns + S.insertRight + back;
		const y = WHOLE_CUBE_TURN;
		const yBack = WHOLE_CUBE_TURN_BACK;
		const stuck: Rule[] = [
			[
				'',
				[
					['RF', S.insertRight],
					['BR', kickOut(y, yBack)],
					['RB', kickOut(y, yBack)],
					['BL', kickOut(y + y, yBack + yBack)],
					['LB', kickOut(y + y, yBack + yBack)],
					['FL', kickOut(yBack, y)],
					['LF', kickOut(yBack, y)]
				]
			]
		];
		const rules: Rule[] = [
			[
				'u',
				[
					['FU', S.insertRight],
					['UR', WHOLE_CUBE_TURN + S.insertLeft + WHOLE_CUBE_TURN_BACK]
				]
			]
		];

		const block = this.moveList.openBlock('Middle');
		for (let i = 0; i < 4; i++) {
			const at = this.perm.apply('FR');
			if (at !== 'FR' && !at.includes('U')) {
				// In the middle layer, in the wrong place: move it to the top.
				this.move(solveVia(this.perm, 'FR', stuck));
			}
			if (this.perm.apply('FR') !== 'FR') {
				this.move(solveVia(this.perm, 'FR', rules));
			}
			this.move(WHOLE_CUBE_TURN);
		}
		block.close();
	}

	// Top cross: dot, L, line, cross, each with F (R U R' U') F'.
	private solveTopCross() {
		const cases: Record<string, string> = {
			UUUU: '',
			XUXU: S.topCross, // line, left to right
			XXUU: S.topCross, // L, at the back and left
			XXXX: S.topCross // dot
		};

		const block = this.moveList.openBlock('Top Cross');
		for (let tries = 0; tries < 4; tries++) {
			// Which top edges have their top color up (F, R, B, L).
			const inverse = this.perm.inverse();
			let up = '';
			for (const face of 'FRBL') {
				up += inverse.apply('U' + face).charAt(0) === 'U' ? 'U' : 'X';
			}
			if (up === 'UUUU') {
				break;
			}
			for (let turns = 0; turns < 4; turns++) {
				const sequence = cases[rotate(up, turns)];
				if (sequence !== undefined) {
					this.move('u'.repeat(turns) + sequence);
					break;
				}
			}
		}
		block.close();
	}

	// Top edges: turn the top until two edges are in place.  If they are next
	// to each other (at the back and right), swap the front and left edges.
	private placeTopEdges() {
		const rules: Rule[] = [
			[
				'u',
				[
					[['UF', 'UF', '', 'UR', 'UR', '', 'UB', 'UB', '', 'UL', 'UL'], ' '],
					[['UF', 'UL', 'UF', '', 'UB', 'UB', '', 'UR', 'UR'], S.swapEdges],
					// Edges across from each other: swap, then try again.
					[['UF', 'UB', 'UF', '', 'UL', 'UL', '', 'UR', 'UR'], S.swapEdges]
				]
			]
		];

		const block = this.moveList.openBlock('Top Edges');
		for (let tries = 0; tries < 3; tries++) {
			let moves = '';
			for (let j = 0; j < 4; j++) {
				moves = solveVia(this.perm, '', rules);
				if (moves !== '') {
					break;
				}
				this.move(WHOLE_CUBE_TURN);
			}
			this.move(moves);
			if (moves.trim() === '' || this.topEdgesSolved()) {
				break;
			}
		}
		block.close();
	}

	private topEdgesSolved(): boolean {
		return ['UF', 'UR', 'UB', 'UL'].every((edge) => this.perm.apply(edge) === edge);
	}

	// Top corners: find a corner in its place (maybe twisted), and cycle the
	// other three around it.  If none is in place, cycle any three first.
	private placeTopCorners() {
		const rules: Rule[] = [
			[
				WHOLE_CUBE_TURN,
				[
					[['UBR', 'ULB', 'UFL', 'UBR'], S.cycleCorners],
					[['ULB', 'UBR', 'URF', 'ULB'], S.cycleCornersBack]
				]
			]
		];

		const block = this.moveList.openBlock('Top Corners');
		for (let tries = 0; tries < 3 && !this.topCornersPlaced(); tries++) {
			const moves = solveVia(this.cornerPlaces(), '', rules);
			this.move(moves === '' ? S.cycleCorners : moves);
		}
		block.close();
	}

	// For each place on top, the corner in it (ignoring twist).
	private cornerPlaces(): Permutation {
		const map = new Permutation();
		for (const corner of ['ULB', 'UBR', 'URF', 'UFL']) {
			let place = this.perm.apply(corner);
			while (place.charAt(0) !== 'U') {
				place = rotate(place, 1);
			}
			map.addMap(place, corner);
		}
		return map;
	}

	private topCornersPlaced(): boolean {
		return ['ULB', 'UBR', 'URF', 'UFL'].every((corner) =>
			[0, 1, 2].some((n) => this.perm.apply(corner) === rotate(corner, n))
		);
	}

	// Twist corners: with the corner to twist at the front right, repeat
	// (R' D' R D) or (D' R' D R) until it's right, then turn the top (not the
	// cube) to the next corner.
	private twistTopCorners() {
		const rules: Rule[] = [
			[
				'',
				[
					['RFU', S.twistCorner],
					['FUR', S.twistCornerBack],
					['URF', '']
				]
			]
		];

		const block = this.moveList.openBlock('Twist Corners');
		for (let i = 0; i < 4; i++) {
			// The corner now at the front right.
			let corner = this.perm.inverse().apply('URF');
			while (corner.charAt(0) !== 'U') {
				corner = rotate(corner, 1);
			}
			this.move(solveVia(this.perm, corner, rules) + 'u');
		}
		block.close();
	}
}
