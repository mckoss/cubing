// Turn a run's events (events.ts) into the move history and the moves the
// cube plays: the one place that reads the stream, whether it comes from
// the runtime running a program or from the playground playing a let.
//
// An algo becomes a block in the history (MoveList.openBlock), a bypassed
// algo and a trace() line become notes between the moves, and a move is
// added to the list (from which the page animates it).  A whole cube turn
// that isn't shown changes the frame: it isn't played, and the moves after
// it are renamed to the faces they turn on the cube as it's held (as the
// runtime's physicalMoves() does).

import { Permutation } from '../cube/permutation';
import { isRotation, perm } from '../cube/moves';
import type { MoveBlock, MoveList } from '../cube/move-list';
import type { RunEvent } from './events';
import { renameMove } from './runtime';

// A block's title: the algo's description, else its name.
function title(event: { name: string | null; description: string | null }): string {
	return event.description ?? event.name ?? 'Algo';
}

// Records events into a move list, one at a time (as a RunListener) or
// all at once.  Call finish() at the end of a run, to close any algos an
// error left open.
export class RunRecorder {
	private open: MoveBlock[] = [];
	private frame = new Permutation();

	constructor(private readonly moveList: MoveList) {}

	readonly listener = (event: RunEvent): void => this.apply(event);

	apply(event: RunEvent): void {
		switch (event.kind) {
			case 'move': {
				const { move, visible } = event.move;
				if (isRotation(move.name) && !visible) {
					this.frame = this.frame.compose(perm(move.name, move.turns));
				} else {
					this.moveList.add([renameMove(this.frame, move)]);
				}
				break;
			}
			case 'enter':
				this.open.push(this.moveList.openBlock(title(event)));
				break;
			case 'leave': {
				const block = this.open.pop();
				if (block === undefined) {
					throw new Error(`${event.loc.line}:${event.loc.column}: Leaving an algo that isn't open`);
				}
				block.close();
				break;
			}
			case 'bypass':
				this.moveList.note('bypass', `${title(event)}: skipped, its goal already holds`);
				break;
			case 'trace':
				this.moveList.note('trace', event.text);
				break;
		}
	}

	finish(): void {
		for (let block = this.open.pop(); block !== undefined; block = this.open.pop()) {
			block.close();
		}
	}
}

// Record a whole run's events.
export function applyEvents(events: Iterable<RunEvent>, moveList: MoveList): void {
	const recorder = new RunRecorder(moveList);
	try {
		for (const event of events) {
			recorder.apply(event);
		}
	} finally {
		recorder.finish();
	}
}
