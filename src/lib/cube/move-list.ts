// The move history, ported from the 2003 Rubik's Cube Simulator.
//
// Moves are kept as quarter turns (each Move has turns 1 or 3), as the 2003
// simulator kept them (one letter per quarter turn), so positions in the
// history count quarter turns.  Moves are recorded in named blocks
// ("Scramble", "Solve U Edges", ...), and a move that undoes the one before
// it cancels out, but never across the start of a block.

import { from2003Notation, inverseTurns, isRotation, simplifyMoves, type Move } from './moves';

// Moves whose 2003 letter turned the other way from standard notation (the
// slices, and z): a half turn is two of their counterclockwise quarter
// turns, as the 2003 simulator recorded it.
const REVERSED_2003 = new Set(['M', 'E', 'S', 'z']);

// Split moves into quarter turns.
function quarterTurns(moves: Move[]): Move[] {
	const result: Move[] = [];
	for (const { name, turns } of moves) {
		if (turns === 2) {
			const quarter: Move = { name, turns: REVERSED_2003.has(name) ? 3 : 1 };
			result.push(quarter, { ...quarter });
		} else {
			result.push({ name, turns });
		}
	}
	return result;
}

function sameMove(a: Move | undefined, b: Move | undefined): boolean {
	return a !== undefined && b !== undefined && a.name === b.name && a.turns === b.turns;
}

function isInverse(a: Move | undefined, b: Move): boolean {
	return a !== undefined && a.name === b.name && a.turns === inverseTurns(b.turns);
}

// Count the turns in a sequence of quarter turns, as the 2003 simulator
// did: a repeated quarter turn is a half turn, and counts once.  Turning the
// whole cube (x, y, z) doesn't count.
function countTurns(moves: Move[]): { faceTurns: number; quarterTurns: number } {
	let faceTurns = 0;
	let quarterTurns = 0;
	let prev: Move | undefined;
	for (const move of moves) {
		const rotation = isRotation(move.name);
		if (!rotation) {
			quarterTurns++;
		}
		if (sameMove(move, prev)) {
			prev = undefined;
			continue;
		}
		if (!rotation) {
			faceTurns++;
		}
		prev = move;
	}
	return { faceTurns, quarterTurns };
}

export class MoveBlock {
	// Positions in the history, in quarter turns.
	readonly start: number;
	end: number | undefined;

	constructor(
		private list: MoveList,
		readonly name: string
	) {
		this.start = list.setWall();
	}

	close(): void {
		this.end = this.list.setWall();
	}
}

export interface HistoryBlock {
	name: string;
	// Moves and nested blocks, in order.
	items: (Move[] | HistoryBlock)[];
	// Face turns (a half turn counts as one; turning the whole cube doesn't
	// count), and quarter turns.
	faceTurns: number;
	quarterTurns: number;
}

export class MoveList {
	// Every move made (as recorded in the history), in quarter turns.
	moves: Move[] = [];
	// Moves waiting to be animated, in quarter turns.
	pending: Move[] = [];
	blocks: MoveBlock[] = [];
	// Moves before the wall can't be combined with new ones (in the history,
	// and in the moves waiting to be animated, so the two stay in step).
	private wall = 0;
	private pendingWall = 0;

	constructor() {
		this.clear();
	}

	clear(): void {
		this.moves = [];
		this.pending = [];
		this.wall = 0;
		this.pendingWall = 0;
		this.blocks = [];
		this.openBlock('Move History');
	}

	setWall(): number {
		this.wall = this.moves.length;
		this.pendingWall = this.pending.length;
		return this.wall;
	}

	// The next move (a quarter turn) to animate.
	nextMove(): Move | undefined {
		const move = this.pending.shift();
		if (move !== undefined) {
			this.pendingWall = Math.max(0, this.pendingWall - 1);
		}
		return move;
	}

	// Add moves (standard notation).
	add(moves: Move[]): void {
		const quarters = quarterTurns(moves);
		this.pending = MoveList.appendAfter(this.pending, this.pendingWall, quarters);
		this.moves = MoveList.appendAfter(this.moves, this.wall, quarters);
	}

	/** @deprecated Add moves in the 2003 notation; use add(). */
	appendMoves(st: string): void {
		this.add(from2003Notation(st));
	}

	// Append quarter turns to the moves after the wall: a move that undoes
	// the last one cancels it, and three of the same quarter turn become one
	// the other way.
	private static appendAfter(list: Move[], wall: number, add: Move[]): Move[] {
		const st = list.slice(wall);
		for (const move of add) {
			if (isInverse(st[st.length - 1], move)) {
				st.pop();
				continue;
			}
			if (sameMove(st[st.length - 1], move) && sameMove(st[st.length - 2], move)) {
				st.splice(-2, 2, { name: move.name, turns: inverseTurns(move.turns) });
				continue;
			}
			st.push({ ...move });
		}
		return [...list.slice(0, wall), ...st];
	}

	openBlock(name: string): MoveBlock {
		const block = new MoveBlock(this, name);
		this.blocks.push(block);
		return block;
	}

	// How many of the recorded moves have been taken to animate.
	get played(): number {
		return Math.max(0, this.moves.length - this.pending.length);
	}

	// The innermost named block (other than the whole history) containing
	// the move at a position.
	blockAt(position: number): MoveBlock | undefined {
		let found: MoveBlock | undefined;
		for (const block of this.blocks.slice(1)) {
			const end = block.end ?? this.moves.length;
			if (block.start <= position && position < end) {
				found = block;
			}
		}
		return found;
	}

	// The next place after a position where a block starts or ends.
	nextBoundary(position: number): number {
		let next = this.moves.length;
		for (const block of this.blocks.slice(1)) {
			for (const at of [block.start, block.end ?? this.moves.length]) {
				if (at > position && at < next) {
					next = at;
				}
			}
		}
		return next;
	}

	// The moves between two positions, combining quarter turns into half
	// turns.
	movesBetween(start: number, end: number): Move[] {
		return simplifyMoves(this.moves.slice(start, end));
	}

	// The history as nested blocks, as the 2003 simulator displayed it.
	history(): HistoryBlock[] {
		// Leave out empty blocks.
		const blocks = this.blocks.filter((b) => b.start !== (b.end ?? this.moves.length));
		let next = 0;

		const build = (block: MoveBlock): HistoryBlock => {
			const end = block.end ?? this.moves.length;
			const items: (Move[] | HistoryBlock)[] = [];
			let pos = block.start;
			while (next < blocks.length && blocks[next].start < end) {
				const child = blocks[next++];
				if (child.start > pos) {
					items.push(this.movesBetween(pos, child.start));
				}
				const built = build(child);
				items.push(built);
				pos = child.end ?? this.moves.length;
			}
			if (pos < end) {
				items.push(this.movesBetween(pos, end));
			}
			return { name: block.name, items, ...countTurns(this.moves.slice(block.start, end)) };
		};

		const result: HistoryBlock[] = [];
		while (next < blocks.length) {
			result.push(build(blocks[next++]));
		}
		return result;
	}
}
