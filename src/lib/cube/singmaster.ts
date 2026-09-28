// Solution from David Singmaster's Notes on Rubik's Magic Cube, 1981.
//
// Ported from the 2003 Rubik's Cube Simulator (Copyright 2003, Mike Koss).
//
// Each step of the solution is a set of rules: turn the cube with a
// "generator" move until the piece being solved reaches one of a few known
// places, then apply the sequence for that place.  In a rule's sequence,
// "P" stands for undoing the generator moves: when the generator turns a
// layer holding pieces already solved, the piece is parked out of the way,
// the layer turned back (P), and the piece put in place.
//
// A move written as a half turn (e.g. R2) is always a clockwise half turn,
// and repeated turns (e.g. U2 U) are written out, so that the solver makes
// exactly the moves the 2003 solver did.

import { Permutation, type Path } from './permutation';
import {
	rotateName,
	type Cube,
	type Cubie,
	type Location,
	type MoveToken,
	type UndoToken,
	type CheckedAlg
} from './types';
import { alg, applyMoves, invertMoves, parseMoves, type Move } from './moves';
import type { MoveList } from './move-list';

// A place is a piece's location (e.g. "fd": the uf edge is at df, flipped),
// or a path of pieces (see Permutation.hasMap).
export type Place = Location | Path;
// Undo the generator moves made so far ("P" in a rule).
export const UNDO = { undo: true } as const;
export type Undo = typeof UNDO;
export type RuleStep = Move | Undo;

// A rule's sequence, checked at compile time: moves, and "P" to undo the
// generator moves, e.g. rule("F2 P F2").
export function rule<S extends string>(text: CheckedAlg<S, MoveToken | UndoToken>): RuleStep[] {
	return text
		.split('P')
		.flatMap((part, i): RuleStep[] => (i === 0 ? parseMoves(part) : [UNDO, ...parseMoves(part)]));
}

// The generator is a move ([] for none: only the cube as it is is
// checked).  An empty sequence means the piece is already where it should
// be.
export type Rule = [generator: Move[], cases: [place: Place, sequence: readonly RuleStep[]][]];

// Which of the four top edges (front, right, back, left) have their top
// color up ("U") or not ("X"), e.g. "XUXU".
type Up = 'U' | 'X';
export type TopEdgePattern = `${Up}${Up}${Up}${Up}`;

export function topEdgePattern(cube: Cube): TopEdgePattern {
	// Which pieces are in each place (the inverse of where each piece is).
	const inverse = cube.inverse();
	const up = (edge: 'uf' | 'ur' | 'ub' | 'ul'): Up =>
		inverse.apply(edge).charAt(0) === 'u' ? 'U' : 'X';
	return `${up('uf')}${up('ur')}${up('ub')}${up('ul')}`;
}

// The pattern seen after turning the top n quarter turns clockwise.
export function rotatePattern(pattern: TopEdgePattern, n: number): TopEdgePattern {
	return (pattern.substring(n) + pattern.substring(0, n)) as TopEdgePattern;
}

// Expand a sequence, replacing each UNDO with the inverse of the generator
// moves made.
function expand(sequence: readonly RuleStep[], generated: Move[]): Move[] {
	const undo = invertMoves(generated);
	return sequence.flatMap((step): Move[] => ('undo' in step ? undo : [step]));
}

// Try the generator up to three times, looking for the piece (or path) at
// one of the places in a rule.  Returns the generator moves and the sequence
// for that place (undefined if none match).
// The piece is '' when the rules' places are all paths.
export function solveVia(perm: Cube, piece: Cubie | '', rules: Rule[]): Move[] | undefined {
	for (const [generator, cases] of rules) {
		let p = perm;
		let moves: Move[] = [];
		for (let i = 0; i < 4; i++) {
			const loc: Location | '' = piece === '' ? '' : p.apply(piece);
			for (const [place, sequence] of cases) {
				if (typeof place === 'string' ? place === loc : p.hasMap(place)) {
					return [...moves, ...expand(sequence, moves)];
				}
			}
			// Quarter turns are kept separate, so that "P" undoes each one.
			moves = [...moves, ...generator];
			p = applyMoves(p, generator);
		}
	}
	return undefined;
}

const Y = alg('y');
const U = alg('U');
const Z2 = alg('z2');

export class Singmaster {
	private perm: Cube = new Permutation();

	constructor(private moveList: MoveList) {}

	private move(moves: Move[]): void {
		this.moveList.add(moves);
		this.perm = applyMoves(this.perm, moves);
	}

	solve(perm: Cube): void {
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
	solveFirstLayer(perm: Cube): Cube {
		this.perm = perm;
		this.solveUEdges();
		this.solveUCorners();
		return this.perm;
	}

	private solveUEdges(): void {
		const rules: Rule[] = [
			[
				alg('D'),
				[
					['df', rule('F2')],
					['fd', rule("F' U' R U")]
				]
			],
			[
				alg("E'"),
				[
					['lf', rule('F P')],
					['rf', rule("F' P")]
				]
			],
			[
				alg('U'),
				[
					['uf', rule('F2 P F2')],
					['fu', rule("F P U' R U")]
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
				alg('D'),
				[
					['rdf', rule("D F D' F'")],
					['frd', rule("D' R' D R")],
					['dfr', rule("F D' F' R' D2 R")]
				]
			],
			[
				alg('U'),
				[
					['urf', rule("F D F' P F D' F'")],
					['rfu', rule("R' D2 R P F D2 F'")],
					['fur', rule("F D2 F' P R' D2 R")]
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
				alg("E'"),
				[
					['rf', rule("B' U' R2 U2 R2 U2 R2 U2 U B P")],
					['fr', rule("L U' F2 U2 F2 U2 F2 U2 U L' P")]
				]
			]
		];
		const rules: Rule[] = [
			[
				alg('U'),
				[
					['ub', rule("B' U' R2 U2 R2 U2 R2 U2 U B")],
					['lu', rule("L U' F2 U2 F2 U2 F2 U2 U L'")]
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
		const sequences: Partial<Record<TopEdgePattern, Move[]>> = {
			UUUU: [],
			XUXU: alg("B L U L' U' B'"),
			UUXX: alg("B U L U' L' B'"),
			XXXX: alg("B L U L' U' B' y2 B U L U' L' B'")
		};
		let up = topEdgePattern(this.perm);

		const block = this.moveList.openBlock('Orient D Edges');
		let moves: Move[] = [];
		for (let j = 0; j < 4; j++) {
			const sequence = sequences[up];
			if (sequence !== undefined) {
				moves = [...moves, ...sequence];
				break;
			}
			up = rotatePattern(up, 1);
			moves = [...moves, ...Y];
		}
		this.move(moves);
		block.close();
	}

	private placeDEdges(): void {
		const rules: Rule[] = [
			[
				alg('U'),
				[
					[['uf', 'ur', 'ub', 'uf'], rule("R2 D' U2 R' L F2 R L' D R2")],
					[['uf', 'ub', 'ur', 'uf'], rule("R2 D' R' L F2 R L' U2 D R2")],
					[
						['uf', 'ur', 'uf', '', 'ul', 'ub', 'ul'],
						rule("R2 D2 B2 D L2 F2 L2 F2 L2 F2 D' B2 D2 R2")
					],
					// Already in place.
					[['uf', 'uf', '', 'ur', 'ur', '', 'ub', 'ub', '', 'ul', 'ul'], []]
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
		const corners: Cubie[] = ['ulb', 'ubr', 'urf', 'ufl'];
		const rules: Rule[] = [
			[
				alg('y'),
				[
					[['ufl', 'ulb', 'ubr', 'ufl'], rule("L' U R U' R' L R U R' U'")],
					[['ufl', 'ubr', 'ulb', 'ufl'], rule("U R U' R' L' R U R' U' L")],
					[
						['ufl', 'urf', 'ufl', '', 'ulb', 'ubr', 'ulb'],
						rule("B L U L' U' L U L' U' L U L' U' B'")
					],
					[
						['ufl', 'ubr', 'ufl', '', 'urf', 'ulb', 'urf'],
						rule("R' B2 F R F' R' F R F' R' F R F' R' B2 R")
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
				[],
				[
					['rfu', rule("D F D' F' D F D' F'")], // counterclockwise
					['fur', rule("F D F' D' F D F' D'")], // clockwise
					['urf', []]
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
