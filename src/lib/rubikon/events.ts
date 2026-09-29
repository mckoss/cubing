// What a Rubikon run produces: one stream of events, in order.  The same
// stream drives the cube simulator (move by move) and builds the execution
// trace (the move history, grouped by algo).  See PLAN.md, milestone 4.

import type { Loc } from './ast';
import type { TaggedMove } from './moves';

export type RunEvent =
	// One turn.  A whole cube turn that isn't visible (not `show(…)`) is a
	// frame change: it renames what follows but isn't shown as a move.
	| { kind: 'move'; move: TaggedMove; loc: Loc }
	// An algo starts; `name` is null for an unnamed stage.
	| { kind: 'enter'; name: string | null; description: string | null; loc: Loc }
	// The algo that last entered ends (its goal, if any, now holds).
	| { kind: 'leave'; loc: Loc }
	// An algo skipped because its goal already held (no enter/leave).
	| { kind: 'bypass'; name: string | null; description: string | null; loc: Loc }
	// A `trace("…")` line, already formatted.
	| { kind: 'trace'; text: string; loc: Loc };

export type RunListener = (event: RunEvent) => void;
