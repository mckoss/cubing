import { describe, expect, it } from 'vitest';
import {
	alg,
	applyMoves,
	FACES,
	formatMoves,
	MOVE_NAMES,
	parseMoves,
	permutationOf
} from './moves';
import { MoveList } from './move-list';
import { rule, Singmaster, solveVia, UNDO } from './singmaster';
import type { Move, MoveName, Turns } from './types';
import reference from './fixtures/singmaster-2003.json';

const TURNS: readonly Turns[] = [1, 2, 3];

function pick<T>(items: readonly T[], r: number): T {
	const item = items[Math.floor(r * items.length)];
	if (item === undefined) {
		throw new Error(`No item at ${r}`);
	}
	return item;
}

// A random scramble of moves with the given names.
function randomMoves(rand: () => number, names: readonly MoveName[], length: number): Move[] {
	return Array.from({ length }, (): Move => ({
		name: pick(names, rand()),
		turns: pick(TURNS, rand())
	}));
}

function random(seed: number): () => number {
	return (): number => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

// The fixture holds the 2003 program's solutions, in quarter turns (as the
// 2003 program recorded them, one letter per quarter turn), with the block
// positions counted in quarter turns.
function solve(scramble: string): MoveList {
	const list = new MoveList();
	new Singmaster(list).solve(permutationOf(parseMoves(scramble)));
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
			expect(applyMoves(permutationOf(parseMoves(scramble)), list.moves).isIdentity()).toBe(true);
		}
	});

	it('solves random face turn scrambles', () => {
		const rand = random(42);
		for (let i = 0; i < 300; i++) {
			const moves = randomMoves(rand, FACES, 30);
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
		const rand = random(7);
		for (const solver of SOLVERS) {
			for (let i = 0; i < 200; i++) {
				const moves = randomMoves(rand, MOVE_NAMES, 30);
				const start = permutationOf(moves);
				const list = new MoveList();
				solver.solve(start, list);
				expect(applyMoves(start, list.moves).isIdentity(), solver.name).toBe(true);
			}
		}
	});
});

describe('rules', () => {
	it('undo the search turns where a rule says P', () => {
		expect(rule('F2 P F2')).toEqual([...alg('F2'), UNDO, ...alg('F2')]);
		expect(rule("F' P")).toEqual([...alg("F'"), UNDO]);
	});

	it('expand P to the inverse of the search turns', () => {
		// The uf edge is at ur: one U turn brings it over its place, F2 parks
		// it below, P turns the top back, and F2 puts it in place.
		const cube = permutationOf(alg("U'"));
		const moves = solveVia(cube, 'uf', [[alg('U'), [['uf', rule('F2 P F2')]]]]);
		expect(moves && formatMoves(moves)).toBe("U F2 U' F2");
	});
});
