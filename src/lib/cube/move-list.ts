// The move history, ported from the 2003 Rubik's Cube Simulator.
//
// Moves are kept in the 2003 notation: one letter per quarter turn, lower
// case for clockwise and upper case for counterclockwise.  Moves are
// recorded in named blocks ("Scramble", "Solve U Edges", ...), and a move
// that undoes the one before it cancels out, but never across the start of
// a block.

import { from2003Notation, simplifyMoves, type Move } from './moves';

function changeCase(ch: string): string {
	return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
}

// Count the turns in a sequence, as the 2003 simulator did: a repeated
// letter is a half turn, and counts once.  Turning the whole cube (i, j, k)
// doesn't count.
function countTurns(moves: string): { faceTurns: number; quarterTurns: number } {
	let faceTurns = 0;
	let quarterTurns = 0;
	let prev: string | undefined;
	for (const ch of moves) {
		const rotation = 'ijk'.includes(ch.toLowerCase());
		if (!rotation) {
			quarterTurns++;
		}
		if (ch === prev) {
			prev = undefined;
			continue;
		}
		if (!rotation) {
			faceTurns++;
		}
		prev = ch;
	}
	return { faceTurns, quarterTurns };
}

export class MoveBlock {
	readonly start: number;
	end: number | undefined;

	constructor(
		private list: MoveList,
		readonly name: string
	) {
		this.start = list.setWall();
	}

	close() {
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
	// Every move made (as recorded in the history).
	moves = '';
	// Moves waiting to be animated.
	pending = '';
	blocks: MoveBlock[] = [];
	// Moves before the wall can't be combined with new ones (in the history,
	// and in the moves waiting to be animated, so the two stay in step).
	private wall = 0;
	private pendingWall = 0;

	constructor() {
		this.clear();
	}

	clear() {
		this.moves = '';
		this.pending = '';
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

	// The next move to animate.
	nextMove(): string | undefined {
		if (this.pending === '') {
			return undefined;
		}
		const ch = this.pending.charAt(0);
		this.pending = this.pending.substring(1);
		this.pendingWall = Math.max(0, this.pendingWall - 1);
		return ch;
	}

	appendMoves(add: string) {
		this.pending =
			this.pending.substring(0, this.pendingWall) +
			MoveList.appendMoves(this.pending.substring(this.pendingWall), add);
		this.moves =
			this.moves.substring(0, this.wall) +
			MoveList.appendMoves(this.moves.substring(this.wall), add);
	}

	static appendMoves(st: string, add: string): string {
		for (const ch of add) {
			if (ch === ' ') {
				continue;
			}
			const last = st.charAt(st.length - 1);
			if (st !== '' && ch === changeCase(last)) {
				st = st.substring(0, st.length - 1);
				continue;
			}
			if (st.length >= 2 && st.substring(st.length - 2) === ch + ch) {
				st = st.substring(0, st.length - 2) + changeCase(ch);
				continue;
			}
			st += ch;
		}
		return st;
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
			return { name: block.name, items, ...countTurns(this.moves.substring(block.start, end)) };
		};

		const result: HistoryBlock[] = [];
		while (next < blocks.length) {
			result.push(build(blocks[next++]));
		}
		return result;
	}

	private movesBetween(start: number, end: number): Move[] {
		return simplifyMoves(from2003Notation(this.moves.substring(start, end)));
	}
}
