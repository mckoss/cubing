// The solvers the simulator offers.

import type { Permutation } from './permutation';
import { applyMoves, parseMoves, type Move } from './moves';
import type { MoveList } from './move-list';
import { Singmaster } from './singmaster';
import { Beginner } from './beginner';

export interface Solver {
	name: string;
	description: string;
	solve(perm: Permutation, moveList: MoveList): void;
}

// Sequences of slice moves, shortest first: every arrangement of the
// centers is reached within three.  (The order of the turns is the order
// the 2003 slices were tried in.)
const SLICE_MOVES: Move[][] = (() => {
	const turns = parseMoves("M' E' S' M E S");
	const found: Move[][] = [[]];
	for (let i = 0; found.length < 1000; i++) {
		for (const turn of turns) {
			found.push([...found[i], turn]);
		}
	}
	return found;
})();

// Slice moves (M, E, S) move the centers, which the 2003 simulator didn't
// track.  Turn the slices to put the centers back in place, so the solvers
// (which leave the centers alone) can finish the job.  (Added in 2026.)
function placeCenters(perm: Permutation, moveList: MoveList): Permutation {
	const centered = (p: Permutation): boolean => p.apply('u') === 'u' && p.apply('f') === 'f';
	if (centered(perm)) {
		return perm;
	}
	const moves = SLICE_MOVES.find((m) => centered(applyMoves(perm, m)));
	if (moves === undefined) {
		throw new Error(`Can't place the centers: ${perm}`);
	}
	const block = moveList.openBlock('Place Centers');
	moveList.add(moves);
	block.close();
	return applyMoves(perm, moves);
}

export const SOLVERS: Solver[] = [
	{
		name: 'Singmaster',
		description:
			"David Singmaster's layer-by-layer solution, from Notes on Rubik's Magic Cube (1981), as programmed in 2003.",
		solve(perm, moveList) {
			new Singmaster(moveList).solve(placeCenters(perm, moveList));
		}
	},
	{
		name: 'Basic Modern Solution',
		description:
			'The simple, basic modern layer-by-layer solution, as Mike learned it: first face, middle layer, then the top.',
		solve(perm, moveList) {
			new Beginner(moveList).solve(placeCenters(perm, moveList));
		}
	}
];
