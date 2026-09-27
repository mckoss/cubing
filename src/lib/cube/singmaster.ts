// Solution from David Singmaster's Notes on Rubik's Magic Cube, 1981.
//
// Ported from the 2003 Rubik's Cube Simulator (Copyright 2003, Mike Koss).
//
// Each step of the solution is a set of rules: turn the cube with a
// "generator" move until the piece being solved reaches one of a few known
// places, then apply the sequence for that place.  In a sequence, "P"
// stands for undoing the generator moves.  Moves are in the 2003 notation
// (lower case clockwise, upper case counterclockwise; x, y, z are slices;
// i, j, k turn the whole cube).

import { Permutation } from './permutation';
import { apply2003, invert2003 } from './moves';
import type { MoveList } from './move-list';

// A place is a piece's location (e.g. "FD": the UF edge is at DF, flipped),
// or a path of pieces (see Permutation.hasMap).
export type Place = string | string[];
export type Rule = [generator: string, cases: [place: Place, sequence: string][]];

// Try the generator up to three times, looking for the piece (or path) at
// one of the places in a rule.  Returns the generator moves and the sequence
// for that place ("" if none match).
export function solveVia(perm: Permutation, piece: string, rules: Rule[]): string {
	for (const [generator, cases] of rules) {
		let p = perm;
		let moves = '';
		for (let i = 0; i < 4; i++) {
			const loc = p.apply(piece);
			for (const [place, sequence] of cases) {
				if (typeof place === 'string' ? place === loc : p.hasMap(place)) {
					return moves + sequence.replace(/P/g, invert2003(moves));
				}
			}
			moves += generator;
			p = apply2003(p, generator);
		}
	}
	return '';
}

function rotate(st: string, n: number): string {
	return st.substring(n) + st.substring(0, n);
}

export class Singmaster {
	private perm = new Permutation();

	constructor(private moveList: MoveList) {}

	private move(moves: string) {
		this.moveList.appendMoves(moves);
		this.perm = apply2003(this.perm, moves);
	}

	solve(perm: Permutation) {
		const block = this.moveList.openBlock('David Singmaster Solution');

		this.perm = perm;

		this.solveUEdges();
		this.solveUCorners();
		this.move('kk');
		this.solveMiddleEdges();
		this.orientDEdges();
		this.placeDEdges();
		this.placeDCorners();
		this.orientDCorners();
		this.move('kk');

		block.close();
	}

	// Solve the Up layer only (used for the first layer of other methods).
	solveFirstLayer(perm: Permutation): Permutation {
		this.perm = perm;
		this.solveUEdges();
		this.solveUCorners();
		return this.perm;
	}

	private solveUEdges() {
		const rules: Rule[] = [
			[
				'd',
				[
					['DF', 'ff'],
					['FD', 'FUru']
				]
			],
			[
				'y',
				[
					['LF', 'fP'],
					['RF', 'FP']
				]
			],
			[
				'u',
				[
					['UF', 'ffPff'],
					['FU', 'fPUru']
				]
			]
		];

		const block = this.moveList.openBlock('Solve U Edges');
		for (let i = 0; i < 4; i++) {
			this.move(solveVia(this.perm, 'UF', rules) + 'j');
		}
		block.close();
	}

	private solveUCorners() {
		const rules: Rule[] = [
			[
				'd',
				[
					['RDF', 'df DF'],
					['FRD', 'DR dr'],
					['DFR', 'fDF Rddr']
				]
			],
			[
				'u',
				[
					['URF', 'fdF P fDF'],
					['RFU', 'Rddr P fddF'],
					['FUR', 'fddF P Rddr']
				]
			]
		];

		const block = this.moveList.openBlock('Solve U Corners');
		for (let i = 0; i < 4; i++) {
			this.move(solveVia(this.perm, 'URF', rules) + 'j');
		}
		block.close();
	}

	private solveMiddleEdges() {
		const prepare: Rule[] = [
			[
				'y',
				[
					['RF', 'BU rruu rruu rruu ubP'],
					['FR', 'lU ffuu ffuu ffuu uLP']
				]
			]
		];
		const rules: Rule[] = [
			[
				'u',
				[
					['UB', 'BU rruu rruu rruu ub'],
					['LU', 'lU ffuu ffuu ffuu uL']
				]
			]
		];

		const block = this.moveList.openBlock('Solve Middle Edges');
		for (let i = 0; i < 4; i++) {
			if (this.perm.apply('RF') !== 'RF') {
				this.move(solveVia(this.perm, 'RF', prepare));
			}
			this.move(solveVia(this.perm, 'RF', rules) + 'j');
		}
		block.close();
	}

	private orientDEdges() {
		// Which pieces are in each place (the inverse of where each piece is).
		const inverse = this.perm.inverse();
		let up = '';
		for (const face of 'FRBL') {
			up += inverse.apply('U' + face).charAt(0) === 'U' ? 'U' : 'X';
		}

		const block = this.moveList.openBlock('Orient D Edges');
		let moves = '';
		for (let j = 0; j < 4; j++) {
			const sequence = {
				UUUU: '',
				XUXU: 'b luLU B',
				UUXX: 'b ulUL B',
				XXXX: 'b luLU B jj b ulULB'
			}[up];
			if (sequence !== undefined) {
				moves += sequence;
				break;
			}
			up = rotate(up, 1);
			moves += 'j';
		}
		this.move(moves);
		block.close();
	}

	private placeDEdges() {
		const rules: Rule[] = [
			[
				'u',
				[
					[['UF', 'UR', 'UB', 'UF'], 'rrD uuR lffrL drr'],
					[['UF', 'UB', 'UR', 'UF'], 'rrD Rlffr Luu drr'],
					[['UF', 'UR', 'UF', '', 'UL', 'UB', 'UL'], 'rrddbbd llff llff llff Dbbddrr'],
					// Already in place (a space, since there's no empty solution).
					[['UF', 'UF', '', 'UR', 'UR', '', 'UB', 'UB', '', 'UL', 'UL'], ' ']
				]
			]
		];

		const block = this.moveList.openBlock('Place D Edges');
		let perm = this.perm;
		let moves = '';
		for (let j = 0; j < 4; j++) {
			const sequence = solveVia(perm, '', rules);
			if (sequence !== '') {
				this.move(moves + sequence);
				block.close();
				return;
			}
			moves += 'j';
			perm = apply2003(perm, 'j');
		}
		throw new Error('Could not find Down edge placement');
	}

	private placeDCorners() {
		const corners = ['ULB', 'UBR', 'URF', 'UFL'];
		const rules: Rule[] = [
			[
				'j',
				[
					[['UFL', 'ULB', 'UBR', 'UFL'], 'L urUR l ruRU'],
					[['UFL', 'UBR', 'ULB', 'UFL'], 'urUR L ruRU l'],
					[['UFL', 'URF', 'UFL', '', 'ULB', 'UBR', 'ULB'], 'b luLU luLU luLU B'],
					[['UFL', 'UBR', 'UFL', '', 'URF', 'ULB', 'URF'], 'Rbb frFR frFR frFR bbr']
				]
			]
		];

		// Where each corner is, ignoring its twist.
		const perm = new Permutation();
		for (const corner of corners) {
			let target = this.perm.apply(corner);
			while (target.charAt(0) !== 'U') {
				target = rotate(target, 1);
			}
			perm.addMap(target, corner);
		}

		const block = this.moveList.openBlock('Place D Corners');
		this.move(solveVia(perm, '', rules));
		block.close();
	}

	private orientDCorners() {
		const rules: Rule[] = [
			[
				'',
				[
					['RFU', 'dfDFdfDF'], // counterclockwise
					['FUR', 'fdFDfdFD'], // clockwise
					['URF', '']
				]
			]
		];

		const block = this.moveList.openBlock('Orient D Corners');
		let perm = this.perm;
		for (let j = 0; j < 4; j++) {
			this.move(solveVia(perm, 'URF', rules) + 'u');
			perm = apply2003(perm, 'j');
		}
		block.close();
	}
}
