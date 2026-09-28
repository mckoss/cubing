// Solution from David Singmaster's Notes on Rubik's Magic Cube, 1981.
//
// Ported from the 2003 Rubik's Cube Simulator (Copyright 2003, Mike Koss).
//
// Each step of the solution is a set of rules: turn the cube with a
// "generator" move until the piece being solved reaches one of a few known
// places, then apply the sequence for that place.  In a sequence, "P"
// stands for undoing the generator moves.  Moves are in standard notation.
//
// A move written as a half turn (e.g. R2) is always a clockwise half turn,
// and repeated turns (e.g. U2 U) are written out, so that the solver makes
// exactly the moves the 2003 solver did.

import { Permutation, type Path } from './permutation';
import { rotateName, type Location } from './types';
import { applyMoves, invertMoves, parseMoves, type Move } from './moves';
import type { MoveList } from './move-list';

// A place is a piece's location (e.g. "fd": the uf edge is at df, flipped),
// or a path of pieces (see Permutation.hasMap).
export type Place = Location | Path;
// A generator and sequences are in standard notation; a sequence may use
// "P" to undo the generator moves made so far.  An empty sequence means the
// piece is already where it should be.
export type Rule = [generator: string, cases: [place: Place, sequence: string][]];

// Expand a sequence, replacing each "P" with the inverse of the generator
// moves made.
function expand(sequence: string, generated: Move[]): Move[] {
	const undo = invertMoves(generated);
	return sequence
		.split('P')
		.flatMap((part, i) => (i === 0 ? parseMoves(part) : [...undo, ...parseMoves(part)]));
}

// Try the generator up to three times, looking for the piece (or path) at
// one of the places in a rule.  Returns the generator moves and the sequence
// for that place (undefined if none match).
// The piece is '' when the rules' places are all paths.
export function solveVia(
	perm: Permutation,
	piece: Location | '',
	rules: Rule[]
): Move[] | undefined {
	for (const [generator, cases] of rules) {
		const turn = parseMoves(generator);
		let p = perm;
		let moves: Move[] = [];
		for (let i = 0; i < 4; i++) {
			const loc = piece === '' ? '' : p.apply(piece);
			for (const [place, sequence] of cases) {
				if (typeof place === 'string' ? place === loc : p.hasMap(place)) {
					return [...moves, ...expand(sequence, moves)];
				}
			}
			// Quarter turns are kept separate, so that "P" undoes each one.
			moves = [...moves, ...turn];
			p = applyMoves(p, turn);
		}
	}
	return undefined;
}

const Y = parseMoves('y');
const U = parseMoves('U');
const Z2 = parseMoves('z2');

function rotate(st: string, n: number): string {
	return st.substring(n) + st.substring(0, n);
}

export class Singmaster {
	private perm = new Permutation();

	constructor(private moveList: MoveList) {}

	private move(moves: Move[]): void {
		this.moveList.add(moves);
		this.perm = applyMoves(this.perm, moves);
	}

	solve(perm: Permutation): void {
		const block = this.moveList.openBlock('David Singmaster Solution');

		this.perm = perm;

		this.solveUEdges();
		this.solveUCorners();
		this.move(Z2);
		this.solveMiddleEdges();
		this.orientDEdges();
		this.placeDEdges();
		this.placeDCorners();
		this.orientDCorners();
		this.move(Z2);

		block.close();
	}

	// Solve the Up layer only (used for the first layer of other methods).
	solveFirstLayer(perm: Permutation): Permutation {
		this.perm = perm;
		this.solveUEdges();
		this.solveUCorners();
		return this.perm;
	}

	private solveUEdges(): void {
		const rules: Rule[] = [
			[
				'D',
				[
					['df', 'F2'],
					['fd', "F' U' R U"]
				]
			],
			[
				"E'",
				[
					['lf', 'F P'],
					['rf', "F' P"]
				]
			],
			[
				'U',
				[
					['uf', 'F2 P F2'],
					['fu', "F P U' R U"]
				]
			]
		];

		const block = this.moveList.openBlock('Solve U Edges');
		for (let i = 0; i < 4; i++) {
			this.move([...(solveVia(this.perm, 'uf', rules) ?? []), ...Y]);
		}
		block.close();
	}

	private solveUCorners(): void {
		const rules: Rule[] = [
			[
				'D',
				[
					['rdf', "D F D' F'"],
					['frd', "D' R' D R"],
					['dfr', "F D' F' R' D2 R"]
				]
			],
			[
				'U',
				[
					['urf', "F D F' P F D' F'"],
					['rfu', "R' D2 R P F D2 F'"],
					['fur', "F D2 F' P R' D2 R"]
				]
			]
		];

		const block = this.moveList.openBlock('Solve U Corners');
		for (let i = 0; i < 4; i++) {
			this.move([...(solveVia(this.perm, 'urf', rules) ?? []), ...Y]);
		}
		block.close();
	}

	private solveMiddleEdges(): void {
		const prepare: Rule[] = [
			[
				"E'",
				[
					['rf', "B' U' R2 U2 R2 U2 R2 U2 U B P"],
					['fr', "L U' F2 U2 F2 U2 F2 U2 U L' P"]
				]
			]
		];
		const rules: Rule[] = [
			[
				'U',
				[
					['ub', "B' U' R2 U2 R2 U2 R2 U2 U B"],
					['lu', "L U' F2 U2 F2 U2 F2 U2 U L'"]
				]
			]
		];

		const block = this.moveList.openBlock('Solve Middle Edges');
		for (let i = 0; i < 4; i++) {
			if (this.perm.apply('rf') !== 'rf') {
				this.move(solveVia(this.perm, 'rf', prepare) ?? []);
			}
			this.move([...(solveVia(this.perm, 'rf', rules) ?? []), ...Y]);
		}
		block.close();
	}

	private orientDEdges(): void {
		// Which pieces are in each place (the inverse of where each piece is).
		const inverse = this.perm.inverse();
		let up = '';
		for (const face of ['f', 'r', 'b', 'l'] as const) {
			up += inverse.apply(`u${face}`).charAt(0) === 'u' ? 'U' : 'X';
		}

		const block = this.moveList.openBlock('Orient D Edges');
		let moves: Move[] = [];
		for (let j = 0; j < 4; j++) {
			const sequence = {
				UUUU: '',
				XUXU: "B L U L' U' B'",
				UUXX: "B U L U' L' B'",
				XXXX: "B L U L' U' B' y2 B U L U' L' B'"
			}[up];
			if (sequence !== undefined) {
				moves = [...moves, ...parseMoves(sequence)];
				break;
			}
			up = rotate(up, 1);
			moves = [...moves, ...Y];
		}
		this.move(moves);
		block.close();
	}

	private placeDEdges(): void {
		const rules: Rule[] = [
			[
				'U',
				[
					[['uf', 'ur', 'ub', 'uf'], "R2 D' U2 R' L F2 R L' D R2"],
					[['uf', 'ub', 'ur', 'uf'], "R2 D' R' L F2 R L' U2 D R2"],
					[['uf', 'ur', 'uf', '', 'ul', 'ub', 'ul'], "R2 D2 B2 D L2 F2 L2 F2 L2 F2 D' B2 D2 R2"],
					// Already in place.
					[['uf', 'uf', '', 'ur', 'ur', '', 'ub', 'ub', '', 'ul', 'ul'], '']
				]
			]
		];

		const block = this.moveList.openBlock('Place D Edges');
		let perm = this.perm;
		let moves: Move[] = [];
		for (let j = 0; j < 4; j++) {
			const sequence = solveVia(perm, '', rules);
			if (sequence !== undefined) {
				this.move([...moves, ...sequence]);
				block.close();
				return;
			}
			moves = [...moves, ...Y];
			perm = applyMoves(perm, Y);
		}
		throw new Error('Could not find Down edge placement');
	}

	private placeDCorners(): void {
		const corners: Location[] = ['ulb', 'ubr', 'urf', 'ufl'];
		const rules: Rule[] = [
			[
				'y',
				[
					[['ufl', 'ulb', 'ubr', 'ufl'], "L' U R U' R' L R U R' U'"],
					[['ufl', 'ubr', 'ulb', 'ufl'], "U R U' R' L' R U R' U' L"],
					[['ufl', 'urf', 'ufl', '', 'ulb', 'ubr', 'ulb'], "B L U L' U' L U L' U' L U L' U' B'"],
					[
						['ufl', 'ubr', 'ufl', '', 'urf', 'ulb', 'urf'],
						"R' B2 F R F' R' F R F' R' F R F' R' B2 R"
					]
				]
			]
		];

		// Where each corner is, ignoring its twist.
		const perm = new Permutation();
		for (const corner of corners) {
			let target = this.perm.apply(corner);
			while (target.charAt(0) !== 'u') {
				target = rotateName(target);
			}
			perm.addMap(target, corner);
		}

		const block = this.moveList.openBlock('Place D Corners');
		this.move(solveVia(perm, '', rules) ?? []);
		block.close();
	}

	private orientDCorners(): void {
		const rules: Rule[] = [
			[
				'',
				[
					['rfu', "D F D' F' D F D' F'"], // counterclockwise
					['fur', "F D F' D' F D F' D'"], // clockwise
					['urf', '']
				]
			]
		];

		const block = this.moveList.openBlock('Orient D Corners');
		let perm = this.perm;
		for (let j = 0; j < 4; j++) {
			this.move([...(solveVia(perm, 'urf', rules) ?? []), ...U]);
			perm = applyMoves(perm, Y);
		}
		block.close();
	}
}
