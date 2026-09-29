import { describe, expect, it } from 'vitest';
import {
	MoveList,
	blockState,
	historyMoves,
	moveState,
	noteState,
	type HistoryBlock,
	type HistoryItem,
	type HistoryMove,
	type HistoryNote,
	type Playhead
} from './move-list';
import { MOVE_NAMES, formatMove, formatMoves, parseMoves, simplifyMoves } from './moves';
import type { Move } from './types';

// The moves in a history, with the quarter turns each was made from:
// "U2@3-5".
function spans(moves: HistoryMove[]): string[] {
	return moves.map((m) => `${formatMove(m)}@${m.start}-${m.end}`);
}

// Where playback is after taking `taken` quarter turns, the last still
// turning or not.
function head(taken: number, turning = true): Playhead {
	return { taken, done: turning ? taken - 1 : taken, current: taken - 1 };
}

const idle = (taken: number): Playhead => ({ taken, done: taken, current: undefined });

// Every block in a history, by name.
function blocksOf(items: HistoryItem[]): Map<string, HistoryBlock> {
	const found = new Map<string, HistoryBlock>();
	for (const item of items) {
		if (!Array.isArray(item) && !('note' in item)) {
			found.set(item.name, item);
			for (const [name, block] of blocksOf(item.items)) found.set(name, block);
		}
	}
	return found;
}

function movesOf(items: HistoryItem[]): HistoryMove[] {
	return items.flatMap((item) =>
		Array.isArray(item) ? item : 'note' in item ? [] : movesOf(item.items)
	);
}

function notesOf(items: HistoryItem[]): HistoryNote[] {
	return items.flatMap((item) =>
		Array.isArray(item) ? [] : 'note' in item ? [item] : notesOf(item.items)
	);
}

describe('historyMoves', () => {
	it('combines quarter turns, keeping their positions', () => {
		const quarters: Move[] = [
			{ name: 'R', turns: 1 },
			{ name: 'U', turns: 1 },
			{ name: 'U', turns: 1 },
			{ name: 'F', turns: 3 }
		];
		expect(spans(historyMoves(quarters, 10))).toEqual(['R@10-11', 'U2@11-13', "F'@13-14"]);
	});

	it('spans quarter turns that cancel out inside a move', () => {
		expect(spans(historyMoves(parseMoves("R U U' R")))).toEqual(['R2@0-4']);
		expect(spans(historyMoves(parseMoves("U U'")))).toEqual([]);
	});

	it('shows the same moves as simplifyMoves', () => {
		// A fixed pseudo-random sequence of quarter turns, from few faces so
		// they combine often.
		let seed = 7;
		const random = (n: number): number => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed % n;
		};
		const names = MOVE_NAMES.slice(0, 3);
		for (let trial = 0; trial < 50; trial++) {
			const quarters: Move[] = Array.from({ length: 12 }, () => ({
				name: names[random(names.length)] ?? 'U',
				turns: random(2) === 0 ? 1 : 3
			}));
			const shown = historyMoves(quarters, 5);
			expect(formatMoves(shown)).toBe(formatMoves(simplifyMoves(quarters)));
			// In order, not overlapping, within the quarter turns given.
			let last = 5;
			for (const move of shown) {
				expect(move.start).toBeGreaterThanOrEqual(last);
				expect(move.end).toBeGreaterThan(move.start);
				last = move.end;
			}
			expect(last).toBeLessThanOrEqual(5 + quarters.length);
		}
	});
});

describe('the history in step with playback', () => {
	// Scramble "R U", then a solution with two stages and a note.
	function example(): MoveList {
		const list = new MoveList();
		const scramble = list.openBlock('Scramble');
		list.add(parseMoves('R U'));
		scramble.close();
		const solution = list.openBlock('Solution');
		const first = list.openBlock('First');
		list.add(parseMoves("U' U'"));
		first.close();
		list.note('trace', 'between');
		const second = list.openBlock('Second');
		list.add(parseMoves('M2 F'));
		second.close();
		solution.close();
		return list;
	}

	it('keeps each shown move’s quarter turns, and the blocks’ and notes’', () => {
		const list = example();
		const [root] = list.history();
		const items = root?.items ?? [];
		// U' U' is one half turn; M2 is two quarter turns (of M', as 2003
		// recorded it).
		expect(spans(movesOf(items))).toEqual(['R@0-1', 'U@1-2', 'U2@2-4', 'M2@4-6', 'F@6-7']);
		const blocks = blocksOf(items);
		expect([...blocks].map(([name, b]) => `${name}@${b.start}-${b.end}`)).toEqual([
			'Scramble@0-2',
			'Solution@2-7',
			'First@2-4',
			'Second@4-7'
		]);
		expect(notesOf(items)).toEqual([{ note: 'trace', text: 'between', at: 4 }]);
		expect(list.moves).toHaveLength(7);
	});

	it('marks the move playing, the blocks containing it, and dims what is ahead', () => {
		const list = example();
		const [root] = list.history();
		const items = root?.items ?? [];
		const moves = movesOf(items);
		const blocks = blocksOf(items);
		const [note] = notesOf(items);
		const states = (at: Playhead): string[] => moves.map((m) => moveState(m, at));
		const block = (name: string, at: Playhead): string => {
			const found = blocks.get(name);
			return found === undefined ? 'missing' : blockState(found, at);
		};

		// Nothing played yet.
		expect(states(idle(0))).toEqual(['ahead', 'ahead', 'ahead', 'ahead', 'ahead']);
		expect(block('Scramble', idle(0))).toBe('ahead');

		// The second quarter turn of U2 is turning.
		const midway = head(4);
		expect(states(midway)).toEqual(['played', 'played', 'current', 'ahead', 'ahead']);
		expect(block('Scramble', midway)).toBe('played');
		expect(block('Solution', midway)).toBe('current');
		expect(block('First', midway)).toBe('current');
		expect(block('Second', midway)).toBe('ahead');
		// The note after U2 shows once U2 has finished.
		expect(note && noteState(note, midway)).toBe('ahead');
		expect(note && noteState(note, head(4, false))).toBe('played');

		// The first quarter of M2 turning: M2 is current, in Second.
		expect(states(head(5))).toEqual(['played', 'played', 'played', 'current', 'ahead']);
		expect(block('First', head(5))).toBe('played');
		expect(block('Second', head(5))).toBe('current');

		// All played, idle: nothing marked.
		expect(states(idle(7))).toEqual(['played', 'played', 'played', 'played', 'played']);
		expect(block('Solution', idle(7))).toBe('played');
	});

	it('follows the moves as they are taken to play', () => {
		const list = example();
		const [root] = list.history();
		const moves = movesOf(root?.items ?? []);
		const current: string[] = [];
		while (list.nextMove() !== undefined) {
			const shown = moves.find((m) => moveState(m, head(list.played)) === 'current');
			current.push(shown === undefined ? '-' : formatMove(shown));
		}
		expect(current).toEqual(['R', 'U', 'U2', 'U2', 'M2', 'M2', 'F']);
	});

	it('maps played moves onto moves combined while waiting to play', () => {
		// U U U waiting to play is recorded (and played) as one U'.
		const list = new MoveList();
		list.add(parseMoves('R U U U'));
		expect(list.pending).toHaveLength(2);
		const [root] = list.history();
		const moves = movesOf(root?.items ?? []);
		expect(spans(moves)).toEqual(['R@0-1', "U'@1-2"]);
		list.nextMove();
		list.nextMove();
		expect(list.played).toBe(2);
		expect(moves.map((m) => moveState(m, head(list.played)))).toEqual(['played', 'current']);
	});

	it('marks a block with only a note once the moves before it are done', () => {
		const list = new MoveList();
		list.add(parseMoves('R'));
		const skipped = list.openBlock('Skipped');
		list.note('bypass', 'Skipped: its goal already holds');
		skipped.close();
		const [root] = list.history();
		const block = blocksOf(root?.items ?? []).get('Skipped');
		expect(block && blockState(block, head(1))).toBe('ahead');
		expect(block && blockState(block, head(1, false))).toBe('played');
	});
});
