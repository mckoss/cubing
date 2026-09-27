import { describe, expect, it } from 'vitest';
import { Permutation } from './permutation';
import { applyMoves, from2003Notation, permutationOf, type Move } from './moves';
import { MoveList } from './move-list';
import { Beginner, SEQUENCES } from './beginner';

function random(seed: number) {
	return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function solve(start: Permutation) {
	const list = new MoveList();
	new Beginner(list).solve(start);
	return list;
}

describe("Mike's beginner method", () => {
	it('uses the sequences from the notes', () => {
		// Each sequence does what the notes draw.
		expect(permutationOf(SEQUENCES.insertRight).apply('FU')).toBe('FR');
		expect(permutationOf(SEQUENCES.insertLeft).apply('FU')).toBe('FL');
		expect(permutationOf(SEQUENCES.swapEdges).toString()).toContain('(UL UF)');
		expect(permutationOf(SEQUENCES.cycleCorners).toString()).toBe('(UBR LBU LUF)');
		expect(permutationOf(SEQUENCES.cycleCornersBack).toString()).toBe('(ULB RUB RFU)');
	});

	it('leaves a solved cube alone', () => {
		expect(solve(new Permutation()).moves).toBe('');
	});

	it('solves random scrambles', () => {
		const rand = random(1980);
		for (let i = 0; i < 500; i++) {
			const moves = Array.from({ length: 30 }, () => ({
				name: 'UDLRFB'[Math.floor(rand() * 6)],
				turns: 1 + Math.floor(rand() * 3)
			})) as Move[];
			const start = permutationOf(moves);
			const list = solve(start);
			expect(applyMoves(start, from2003Notation(list.moves)).toString(), `scramble ${i}`).toBe(
				'<Identity>'
			);
		}
	});

	it('names each stage in the history', () => {
		const list = solve(permutationOf("R U F' L2 D B' R2 U'"));
		const names = list.blocks.map((b) => b.name);
		expect(names).toEqual(
			expect.arrayContaining([
				"Mike's Beginner Method",
				'First Face (White)',
				'Middle',
				'Top Cross',
				'Top Edges',
				'Top Corners',
				'Twist Corners'
			])
		);
	});
});
