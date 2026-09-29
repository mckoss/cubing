// The move history, ported from the 2003 Rubik's Cube Simulator.
//
// Moves are kept as quarter turns (each Move has turns 1 or 3), as the 2003
// simulator kept them (one letter per quarter turn), so positions in the
// history count quarter turns.  Moves are recorded in named blocks
// ("Scramble", "Solve U Edges", ...), and a move that undoes the one before
// it cancels out, but never across the start of a block.  Notes (a line of
// text, such as a Rubikon trace) can be recorded between moves; they're
// walls too.

import {
	appendMove,
	inverseTurns,
	isRotation,
	simplifyMoves,
	type Move,
	type MoveName
} from './moves';

// Moves whose 2003 letter turned the other way from standard notation (the
// slices, and z): a half turn is two of their counterclockwise quarter
// turns, as the 2003 simulator recorded it.
const REVERSED_2003: ReadonlySet<MoveName> = new Set<MoveName>(['M', 'E', 'S', 'z']);

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
	// When the block was opened and closed, among the blocks and notes (see
	// MoveList.mark), to tell which block a note is in.
	readonly opened: number;
	closed: number | undefined;

	constructor(
		private list: MoveList,
		readonly name: string
	) {
		({ at: this.start, seq: this.opened } = list.mark());
	}

	close(): void {
		({ at: this.end, seq: this.closed } = this.list.mark());
	}
}

// What a note is: a Rubikon trace() line, or an algo skipped because its
// goal already held.
export type NoteKind = 'trace' | 'bypass';

export interface HistoryNote {
	note: NoteKind;
	text: string;
	// Its position in the history (it comes after this many quarter turns).
	at: number;
}

interface Note extends HistoryNote {
	seq: number;
}

// A move as the history shows it (quarter turns combined), with the
// quarter turns it was made from: positions start to end (not including
// end).
export interface HistoryMove extends Move {
	start: number;
	end: number;
}

export type HistoryItem = HistoryMove[] | HistoryBlock | HistoryNote;

export interface HistoryBlock {
	name: string;
	// Its moves' positions, in quarter turns (start to end, not including
	// end).
	start: number;
	end: number;
	// Moves, notes, and nested blocks, in order.
	items: HistoryItem[];
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
	notes: Note[] = [];
	// Moves before the wall can't be combined with new ones (in the history,
	// and in the moves waiting to be animated, so the two stay in step).
	private wall = 0;
	private pendingWall = 0;
	// Counts blocks opened and closed, and notes, in order.
	private seq = 0;

	constructor() {
		this.clear();
	}

	clear(): void {
		this.moves = [];
		this.pending = [];
		this.wall = 0;
		this.pendingWall = 0;
		this.blocks = [];
		this.notes = [];
		this.seq = 0;
		this.openBlock('Move History');
	}

	setWall(): number {
		this.wall = this.moves.length;
		this.pendingWall = this.pending.length;
		return this.wall;
	}

	// Set a wall, and number the block boundary or note being made there.
	mark(): { at: number; seq: number } {
		return { at: this.setWall(), seq: this.seq++ };
	}

	// Add a line of text between the moves before and after it, in the
	// innermost open block.
	note(note: NoteKind, text: string): void {
		this.notes.push({ note, text, ...this.mark() });
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

	// The history as nested blocks, as the 2003 simulator displayed it,
	// with the notes in the blocks that were open when they were made.
	history(): HistoryBlock[] {
		// Block boundaries and notes, in the order they were made.
		type Mark =
			| { seq: number; at: number; open: MoveBlock }
			| { seq: number; at: number; close: MoveBlock }
			| { seq: number; at: number; note: Note };
		const marks: Mark[] = [];
		for (const block of this.blocks) {
			marks.push({ seq: block.opened, at: block.start, open: block });
			if (block.end !== undefined && block.closed !== undefined) {
				marks.push({ seq: block.closed, at: block.end, close: block });
			}
		}
		for (const note of this.notes) {
			marks.push({ seq: note.seq, at: note.at, note });
		}
		marks.sort((a, b) => a.seq - b.seq);

		const result: HistoryBlock[] = [];
		const open: { block: MoveBlock; items: HistoryItem[] }[] = [];
		let pos = 0;

		// Moves up to a position go in the innermost open block.
		const flush = (to: number): void => {
			if (to > pos) {
				open[open.length - 1]?.items.push(historyMoves(this.moves.slice(pos, to), pos));
				pos = to;
			}
		};

		// Close the innermost open block.  Empty blocks are left out.
		const pop = (): void => {
			const top = open.pop();
			if (top === undefined || top.items.length === 0) return;
			const { block, items } = top;
			const end = block.end ?? this.moves.length;
			const built = {
				name: block.name,
				start: block.start,
				end,
				items,
				...countTurns(this.moves.slice(block.start, end))
			};
			(open[open.length - 1]?.items ?? result).push(built);
		};

		for (const mark of marks) {
			flush(mark.at);
			if ('open' in mark) {
				open.push({ block: mark.open, items: [] });
			} else if ('close' in mark) {
				// Closing a block closes any still open inside it.
				if (open.some((o) => o.block === mark.close)) {
					while (open[open.length - 1]?.block !== mark.close) pop();
					pop();
				}
			} else {
				const { note, text, at } = mark.note;
				open[open.length - 1]?.items.push({ note, text, at });
			}
		}
		flush(this.moves.length);
		while (open.length > 0) pop();
		return result;
	}
}

// Combine quarter turns into the moves the history shows (as
// simplifyMoves does), keeping track of which quarter turns each one was
// made from; `offset` is the position of the first.  Quarter turns that
// cancel out aren't in any move.
export function historyMoves(quarters: Move[], offset = 0): HistoryMove[] {
	const result: HistoryMove[] = [];
	quarters.forEach((move, i) => {
		const last = result[result.length - 1];
		const combined = appendMove(last === undefined ? [] : [last], move);
		const at = offset + i;
		if (last === undefined || combined.length === 2) {
			result.push({ name: move.name, turns: move.turns, start: at, end: at + 1 });
		} else {
			result.pop();
			const [merged] = combined;
			if (merged !== undefined) {
				result.push({ name: merged.name, turns: merged.turns, start: last.start, end: at + 1 });
			}
		}
	});
	return result;
}

// Where playback is, in quarter turns: `taken` moves have been taken to
// play (the last may still be turning), `done` have finished turning, and
// `current` is the one turning or last stepped to, while playing is under
// way (undefined when idle).
export interface Playhead {
	taken: number;
	done: number;
	current: number | undefined;
}

// How far along a part of the history is: played, the move now playing
// (or the block containing it), or not yet played.
export type PlayState = 'played' | 'current' | 'ahead';

export function moveState(move: HistoryMove, head: Playhead): PlayState {
	if (head.current !== undefined && move.start <= head.current && head.current < move.end) {
		return 'current';
	}
	return move.start < head.taken ? 'played' : 'ahead';
}

// A note shows once the moves before it have finished.
export function noteState(note: HistoryNote, head: Playhead): PlayState {
	return note.at <= head.done ? 'played' : 'ahead';
}

// A block has started once its first move is taken (or, without moves,
// once the moves before it have finished), and is current while it
// contains the current move.
export function blockState(block: HistoryBlock, head: Playhead): PlayState {
	if (head.current !== undefined && block.start <= head.current && head.current < block.end) {
		return 'current';
	}
	const started = block.end > block.start ? block.start < head.taken : block.start <= head.done;
	return started ? 'played' : 'ahead';
}
