import { describe, expect, it } from 'vitest';
import { applyMoves, formatMoves, permutationOf, type Move } from './moves';
import { MoveList } from './move-list';
import { Singmaster } from './singmaster';
import reference from './fixtures/singmaster-2003.json';

// The fixture holds the 2003 program's solutions, in quarter turns (as the
// 2003 program recorded them, one letter per quarter turn), with the block
// positions counted in quarter turns.
function solve(scramble: string): MoveList {
	const list = new MoveList();
	new Singmaster(list).solve(permutationOf(scramble));
	return list;
}

describe('Singmaster solver', () => {
	it('matches the 2003 solver move for move', () => {
		for (const { scramble, moves, blocks } of reference) {
			const list = solve(scramble);
			expect(
				list.moves.every((m) => m.turns !== 2),
				scramble
			).toBe(true);
			expect(formatMoves(list.moves), scramble).toBe(moves);
			expect(
				list.blocks.map((b) => [b.name, b.start, b.end ?? null]),
				scramble
			).toEqual(blocks);
		}
	});

	it('queues the same moves it records in the history', () => {
		for (const { scramble } of reference) {
			const list = solve(scramble);
			expect(list.pending, scramble).toEqual(list.moves);
		}
	});

	it('solves every reference scramble', () => {
		for (const { scramble } of reference) {
			const list = solve(scramble);
			expect(applyMoves(permutationOf(scramble), list.moves).isIdentity()).toBe(true);
		}
	});

	it('solves random face turn scrambles', () => {
		let seed = 42;
		const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
		for (let i = 0; i < 300; i++) {
			const moves = Array.from({ length: 30 }, () => ({
				name: 'UDLRFB'[Math.floor(rand() * 6)],
				turns: 1 + Math.floor(rand() * 3)
			})) as Move[];
			const start = permutationOf(moves);
			const list = new MoveList();
			new Singmaster(list).solve(start);
			expect(applyMoves(start, list.moves).isIdentity()).toBe(true);
		}
	});
});

describe('solvers', () => {
	it('solve scrambles with slices and whole cube turns', async () => {
		const { SOLVERS } = await import('./solvers');
		let seed = 7;
		const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
		for (const solver of SOLVERS) {
			for (let i = 0; i < 200; i++) {
				const moves = Array.from({ length: 30 }, () => ({
					name: 'UDLRFBMESxyz'[Math.floor(rand() * 12)],
					turns: 1 + Math.floor(rand() * 3)
				})) as Move[];
				const start = permutationOf(moves);
				const list = new MoveList();
				solver.solve(start, list);
				expect(applyMoves(start, list.moves).isIdentity(), solver.name).toBe(true);
			}
		}
	});
});
