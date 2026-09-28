import { describe, expect, it } from 'vitest';
import { Permutation } from './permutation';
import { applyMoves, invertMoves, parseMoves, permutationOf, type Move } from './moves';
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

describe('Basic Modern Solution', () => {
	it('uses the sequences from the notes', () => {
		// Each sequence does what the notes draw.
		expect(permutationOf(SEQUENCES.insertRight).apply('FU')).toBe('FR');
		expect(permutationOf(SEQUENCES.insertLeft).apply('FU')).toBe('FL');
		expect(permutationOf(SEQUENCES.swapEdges).toString()).toContain('(UL UF)');
		expect(permutationOf(SEQUENCES.cycleCorners).toString()).toBe('(UBR LBU LUF)');
		expect(permutationOf(SEQUENCES.cycleCornersBack).toString()).toBe('(ULB RUB RFU)');
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
			expect(applyMoves(start, list.moves).toString(), `scramble ${i}`).toBe('<Identity>');
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
		const edges = ['DF', 'DR', 'DB', 'DL'];
		const cases: [string, string[], string[]][] = [
			['DF', ['F2', "U' R' F R"], edges],
			['DFR', ["R U R'", "F' U' F", "R U2 R' U' R U R'"], [...edges, 'DRB', 'DBL', 'DLF']]
		];
		for (const [piece, sequences, bottom] of cases) {
			for (const moves of sequences) {
				const p = permutationOf(moves);
				const start = permutationOf(invertMoves(parseMoves(moves))).apply(piece);
				expect(start, moves).toContain('U');
				for (const other of bottom.filter((b) => b !== piece)) {
					expect(p.apply(other), `${moves} moves ${other}`).toBe(other);
				}
			}
		}
	});
});

describe('top cross pictures', () => {
	// Which top edges show the top color (U), in the order F R B L.
	const pattern = (p: Permutation) => {
		const inverse = p.inverse();
		return [...'FRBL'].filter((f) => inverse.apply('U' + f).charAt(0) === 'U').join('');
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
		expect([...after.get('')!]).toEqual(['FR']);
		expect([...after.get('BL')!]).toEqual(['RL']);
		expect([...after.get('RL')!]).toEqual(['FRBL']);
		// Held the wrong way: an L elsewhere stays an L; a line front to back
		// goes back to a dot.
		expect([...after.get('RB')!]).toEqual(['RB']);
		expect([...after.get('FB')!]).toEqual(['']);
	});
});

describe('case pictures', () => {
	// The arrangement a sequence fixes is the one its inverse makes.
	const fixes = (moves: string) => permutationOf(invertMoves(parseMoves(moves)));

	it('twist the front right corner the way its yellow sticker faces', () => {
		// (R' D' R D)x2 when yellow (the U sticker) faces right...
		expect(fixes(SEQUENCES.twistCorner).apply('URF')).toBe('RFU');
		// ...and (D' R' D R)x2 when it faces front.
		expect(fixes(SEQUENCES.twistCornerBack).apply('URF')).toBe('FUR');
	});

	it('insert the top front edge down to the left or right', () => {
		// The front sticker stays in front; the top sticker goes to the side.
		expect(permutationOf(SEQUENCES.insertLeft).apply('FU')).toBe('FL');
		expect(permutationOf(SEQUENCES.insertRight).apply('FU')).toBe('FR');
	});

	it('swap the left and front edges, and cycle corners around a fixed one', () => {
		const swap = permutationOf(SEQUENCES.swapEdges);
		expect([swap.apply('UL'), swap.apply('UF'), swap.apply('UB'), swap.apply('UR')]).toEqual([
			'UF',
			'UL',
			'UB',
			'UR'
		]);
		// Where a corner goes, ignoring its twist (the next step fixes that).
		const place = (p: Permutation, corner: string) => {
			let at = p.apply(corner);
			while (!at.startsWith('U')) at = at.substring(1) + at.charAt(0);
			return at;
		};
		const corners = permutationOf(SEQUENCES.cycleCorners);
		// Back right -> back left -> front left -> back right; front right stays.
		expect(['UBR', 'ULB', 'UFL', 'URF'].map((c) => place(corners, c))).toEqual([
			'ULB',
			'UFL',
			'UBR',
			'URF'
		]);
		const back = permutationOf(SEQUENCES.cycleCornersBack);
		// Back left -> back right -> front right -> back left; front left stays.
		expect(['ULB', 'UBR', 'URF', 'UFL'].map((c) => place(back, c))).toEqual([
			'UBR',
			'URF',
			'ULB',
			'UFL'
		]);
	});
});
