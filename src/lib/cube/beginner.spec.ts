import { describe, expect, it } from 'vitest';
import { Permutation } from './permutation';
import { applyMoves, invertMoves, parseMoves, permutationOf, type Move } from './moves';
import { MoveList } from './move-list';
import { rotateName, type Location } from './types';
import { Beginner, SEQUENCES } from './beginner';

function random(seed: number) {
	return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function solve(start: Permutation) {
	const list = new MoveList();
	new Beginner(list).solve(start);
	return list;
}

describe('Basic Modern Solution', () => {
	it('uses the sequences from the notes', () => {
		// Each sequence does what the notes draw.
		expect(permutationOf(SEQUENCES.insertRight).apply('fu')).toBe('fr');
		expect(permutationOf(SEQUENCES.insertLeft).apply('fu')).toBe('fl');
		expect(permutationOf(SEQUENCES.swapEdges).toString()).toContain('(ul uf)');
		expect(permutationOf(SEQUENCES.cycleCorners).toString()).toBe('(ubr lbu luf)');
		expect(permutationOf(SEQUENCES.cycleCornersBack).toString()).toBe('(ulb rub rfu)');
	});

	it('leaves a solved cube alone', () => {
		expect(solve(new Permutation()).moves).toEqual([]);
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
			expect(applyMoves(start, list.moves).toString(), `scramble ${i}`).toBe('()');
		}
	});

	it('names each stage in the history', () => {
		const list = solve(permutationOf("R U F' L2 D B' R2 U'"));
		const names = list.blocks.map((b) => b.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'Basic Modern Solution',
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

describe('first face, white down', () => {
	it('never turns the cube over', () => {
		const rand = random(2003);
		for (let i = 0; i < 100; i++) {
			const moves = Array.from({ length: 30 }, () => ({
				name: 'UDLRFB'[Math.floor(rand() * 6)],
				turns: 1 + Math.floor(rand() * 3)
			})) as Move[];
			const list = solve(permutationOf(moves));
			const first = list.blocks.find((b) => b.name === 'First Face (White)')!;
			// Only turns of the whole cube about the vertical axis (y).
			const turns = list.moves.slice(first.start, first.end);
			expect(turns.filter((m) => m.name === 'x' || m.name === 'z')).toEqual([]);
			expect(list.blocks.map((b) => b.name)).toEqual(
				expect.arrayContaining(['Bottom Edges', 'Bottom Corners'])
			);
		}
	});

	it('puts pieces down without disturbing the pieces already down', () => {
		// The edges go first, so the edges may move the bottom corners.
		const edges: Location[] = ['df', 'dr', 'db', 'dl'];
		const cases: [Location, string[], Location[]][] = [
			['df', ['F2', "U' R' F R"], edges],
			['dfr', ["R U R'", "F' U' F", "R U2 R' U' R U R'"], [...edges, 'drb', 'dbl', 'dlf']]
		];
		for (const [piece, sequences, bottom] of cases) {
			for (const moves of sequences) {
				const p = permutationOf(moves);
				const start = permutationOf(invertMoves(parseMoves(moves))).apply(piece);
				expect(start, moves).toContain('u');
				for (const other of bottom.filter((b) => b !== piece)) {
					expect(p.apply(other), `${moves} moves ${other}`).toBe(other);
				}
			}
		}
	});
});

describe('top cross pictures', () => {
	// Which top edges show the top color (u), in the order f r b l.
	const pattern = (p: Permutation) => {
		const inverse = p.inverse();
		return (['f', 'r', 'b', 'l'] as const)
			.filter((f) => inverse.apply(`u${f}`).charAt(0) === 'u')
			.join('');
	};

	// Cubes reached by the top cross sequence and turns of the top.
	const cubes = () => {
		const cross = parseMoves(SEQUENCES.topCross);
		const turns = ['U', 'U2', "U'"].map((m) => parseMoves(m));
		const flipTwo = parseMoves("F U R U' R' F'");
		const found: Permutation[] = [];
		let seed = 11;
		const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
		for (let i = 0; i < 500; i++) {
			let p = new Permutation();
			for (let k = 0; k < 8; k++) {
				p = applyMoves(p, rand() < 0.5 ? cross : turns[Math.floor(rand() * 3)]);
			}
			if (rand() < 0.3) p = applyMoves(p, flipTwo);
			found.push(p);
		}
		return found;
	};

	it('match what the sequence does', () => {
		const after = new Map<string, Set<string>>();
		for (const p of cubes()) {
			const before = pattern(p);
			if (!after.has(before)) after.set(before, new Set());
			after.get(before)!.add(pattern(applyMoves(p, parseMoves(SEQUENCES.topCross))));
		}
		// Dot -> L at the front right; L at the back left -> line from left to
		// right; line -> cross.
		expect([...after.get('')!]).toEqual(['fr']);
		expect([...after.get('bl')!]).toEqual(['rl']);
		expect([...after.get('rl')!]).toEqual(['frbl']);
		// Held the wrong way: an L elsewhere stays an L; a line front to back
		// goes back to a dot.
		expect([...after.get('rb')!]).toEqual(['rb']);
		expect([...after.get('fb')!]).toEqual(['']);
	});
});

describe('case pictures', () => {
	// The arrangement a sequence fixes is the one its inverse makes.
	const fixes = (moves: string) => permutationOf(invertMoves(parseMoves(moves)));

	it('twist the front right corner the way its yellow sticker faces', () => {
		// (R' D' R D)x2 when yellow (the U sticker) faces right...
		expect(fixes(SEQUENCES.twistCorner).apply('urf')).toBe('rfu');
		// ...and (D' R' D R)x2 when it faces front.
		expect(fixes(SEQUENCES.twistCornerBack).apply('urf')).toBe('fur');
	});

	it('insert the top front edge down to the left or right', () => {
		// The front sticker stays in front; the top sticker goes to the side.
		expect(permutationOf(SEQUENCES.insertLeft).apply('fu')).toBe('fl');
		expect(permutationOf(SEQUENCES.insertRight).apply('fu')).toBe('fr');
	});

	it('swap the left and front edges, and cycle corners around a fixed one', () => {
		const swap = permutationOf(SEQUENCES.swapEdges);
		expect([swap.apply('ul'), swap.apply('uf'), swap.apply('ub'), swap.apply('ur')]).toEqual([
			'uf',
			'ul',
			'ub',
			'ur'
		]);
		// Where a corner goes, ignoring its twist (the next step fixes that).
		const place = (p: Permutation, corner: Location): Location => {
			let at = p.apply(corner);
			while (!at.startsWith('u')) at = rotateName(at);
			return at;
		};
		const corners = permutationOf(SEQUENCES.cycleCorners);
		// Back right -> back left -> front left -> back right; front right stays.
		expect((['ubr', 'ulb', 'ufl', 'urf'] as const).map((c) => place(corners, c))).toEqual([
			'ulb',
			'ufl',
			'ubr',
			'urf'
		]);
		const back = permutationOf(SEQUENCES.cycleCornersBack);
		// Back left -> back right -> front right -> back left; front left stays.
		expect((['ulb', 'ubr', 'urf', 'ufl'] as const).map((c) => place(back, c))).toEqual([
			'ubr',
			'urf',
			'ulb',
			'ufl'
		]);
	});
});
