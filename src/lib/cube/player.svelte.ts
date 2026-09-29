// The cube player shared by the pages: the move list, the cube view, and
// playing moves one at a time (with pausing and stepping), as page state.
// CubePlayer.svelte shows it; MoveHistory.svelte shows its history.

import { Permutation } from './permutation';
import { applyMoves, randomScramble } from './moves';
import type { Cube, Move, MoveName } from './types';
import { MoveList, type Playhead } from './move-list';
import { CubeView, type Speed } from './view';

// Where we are in the moves being played (for stepping through them),
// counting a half turn as one move, as the history does.
// The block being played, and which of its moves.
export interface Stage {
	name: string;
	move: number;
	of: number;
}

// The key for each move: its letter, in lower case (with Shift for
// counterclockwise).
type MoveKey = Lowercase<MoveName>;
const KEYS: Readonly<Record<MoveKey, MoveName>> = {
	u: 'U',
	d: 'D',
	l: 'L',
	r: 'R',
	f: 'F',
	b: 'B',
	m: 'M',
	e: 'E',
	s: 'S',
	x: 'x',
	y: 'y',
	z: 'z'
};

function isMoveKey(key: string): key is MoveKey {
	return Object.hasOwn(KEYS, key);
}

export class Player {
	readonly moveList = new MoveList();
	view: CubeView | undefined = $state();
	noWebGL = $state(false);

	// The arrangement shown (updated as each move finishes turning).
	perm: Cube = $state(new Permutation());
	// The move (a quarter turn) now turning, if any.
	turning: Move | undefined = $state();
	// Bumped whenever the move list changes, to update the page.
	version = $state(0);
	speed: Speed = $state('Slow');
	showLabels = $state(true);

	// Stepping through moves: when paused, only `steps` more moves are made.
	stepThrough = $state(false);
	paused = $state(false);
	private steps = 0;

	// Read `version` so these update when the move list changes.
	readonly history = $derived.by(() => {
		void this.version;
		return this.moveList.history();
	});
	readonly pendingCount = $derived.by(() => {
		void this.version;
		return this.moveList.pending.length;
	});
	readonly solved = $derived(this.perm.isIdentity());
	readonly idle = $derived(this.pendingCount === 0 && this.turning === undefined);
	// Where playback is, for showing it in the history.
	readonly playhead = $derived.by((): Playhead => {
		void this.version;
		const taken = this.moveList.played;
		const done = Math.max(0, taken - (this.turning ? 1 : 0));
		return { taken, done, current: this.idle || taken === 0 ? undefined : taken - 1 };
	});
	// Bumped when moves are added or playback is started or stepped, so the
	// history goes back to following the move being played.
	cue = $state(0);

	readonly stage = $derived.by((): Stage | undefined => {
		void this.version;
		const { moveList, turning } = this;
		if (moveList.pending.length === 0 && turning === undefined) return undefined;
		const position = moveList.played - (turning ? 1 : 0);
		const block = moveList.blockAt(position);
		if (block === undefined) return undefined;
		const end = block.end ?? moveList.moves.length;
		const count = (from: number, to: number): number => moveList.movesBetween(from, to).length;
		return {
			name: block.name,
			move: count(block.start, position) + 1,
			of: count(block.start, end)
		};
	});

	// Show the cube on a canvas; returns a function to stop.
	attach(canvas: HTMLCanvasElement): () => void {
		try {
			this.view = new CubeView(canvas);
		} catch (e) {
			// Without WebGL, moves still work; they just aren't drawn.
			console.warn(e);
			this.noWebGL = true;
		}
		void this.animate();
		return (): void => this.view?.dispose();
	}

	// Add moves, optionally as a named block.
	play(moves: Move[], blockName?: string): void {
		const block = blockName ? this.moveList.openBlock(blockName) : undefined;
		this.moveList.add(moves);
		block?.close();
		this.changed();
	}

	// Show changes made to the move list, and play the moves added.
	changed(): void {
		this.version++;
		this.cue++;
		void this.animate();
	}

	private animating = false;
	// Changed by Reset, so a move that was turning is dropped.
	private generation = 0;
	private async animate(): Promise<void> {
		if (this.animating || (!this.view && !this.noWebGL)) return;
		this.animating = true;
		const current = this.generation;
		let next: Move | undefined;
		while (
			current === this.generation &&
			(!this.paused || this.steps > 0) &&
			(next = this.moveList.nextMove()) !== undefined
		) {
			if (this.paused) this.steps--;
			this.turning = next;
			this.version++;
			await this.view?.turn(next);
			if (current !== this.generation) break;
			this.perm = applyMoves(this.perm, [next]);
			this.turning = undefined;
		}
		this.animating = false;
		this.version++;
		// Moves may have been added after a reset.
		if (current !== this.generation) void this.animate();
	}

	// The arrangement once all queued moves are made.
	finalPerm(): Cube {
		return applyMoves(this.perm, [
			...(this.turning ? [this.turning] : []),
			...this.moveList.pending
		]);
	}

	// Start the history again with a random scramble.
	scramble(): void {
		this.clearHistory();
		this.play(randomScramble(), 'Scramble');
	}

	move(name: MoveName, counterclockwise: boolean): void {
		this.play([{ name, turns: counterclockwise ? 3 : 1 }]);
	}

	// Start the history again (the cube stays as it is), playing what's
	// added next straight through.
	clearHistory(): void {
		this.moveList.clear();
		this.paused = false;
		this.steps = 0;
	}

	// Play what's added next paused, if stepping through.
	startSolution(): void {
		this.paused = this.stepThrough;
		this.steps = 0;
	}

	playPause(): void {
		this.cue++;
		this.paused = !this.paused;
		this.steps = 0;
		void this.animate();
	}

	nextMove(): void {
		this.cue++;
		this.paused = true;
		// A half turn is the same quarter turn twice in a row: play both.
		const [first, second] = this.moveList.pending;
		this.steps =
			first !== undefined &&
			second !== undefined &&
			first.name === second.name &&
			first.turns === second.turns
				? 2
				: 1;
		void this.animate();
	}

	// Play on to the next place a block starts or ends: the next algo
	// (including one called by another, like lift), or the rest of this one.
	nextAlgo(): void {
		this.cue++;
		this.paused = true;
		this.steps = this.moveList.nextBoundary(this.moveList.played) - this.moveList.played;
		void this.animate();
	}

	reset(): void {
		this.generation++;
		this.paused = false;
		this.steps = 0;
		this.moveList.clear();
		this.view?.reset();
		this.perm = new Permutation();
		this.turning = undefined;
		this.version++;
	}

	// Turn the cube for a move's key, unless typing in a field.
	keydown(ev: KeyboardEvent): void {
		const target = ev.target;
		if (
			ev.ctrlKey ||
			ev.metaKey ||
			ev.altKey ||
			(target instanceof Element && target.closest('input, select, textarea'))
		) {
			return;
		}
		const key = ev.key.toLowerCase();
		const name = isMoveKey(key) ? KEYS[key] : undefined;
		if (name !== undefined) {
			ev.preventDefault();
			this.move(name, ev.shiftKey);
		}
	}
}
