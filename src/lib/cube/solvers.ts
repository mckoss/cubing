// The solvers the simulator offers.

import type { Permutation } from './permutation';
import { apply2003 } from './moves';
import type { MoveList } from './move-list';
import { Singmaster } from './singmaster';
import { Beginner } from './beginner';

export interface Solver {
	name: string;
	description: string;
	solve(perm: Permutation, moveList: MoveList): void;
}

// Slice moves (in the 2003 notation, where x, y, and z are the slices),
// shortest first: every arrangement of the centers is reached within three.
const SLICE_MOVES = (() => {
	const found = [''];
	for (let i = 0; found.length < 1000; i++) {
		for (const turn of ['x', 'y', 'z', 'X', 'Y', 'Z']) {
			found.push(found[i] + turn);
		}
	}
	return found;
})();

// Slice moves (M, E, S) move the centers, which the 2003 simulator didn't
// track.  Turn the slices to put the centers back in place, so the solvers
// (which leave the centers alone) can finish the job.  (Added in 2026.)
function placeCenters(perm: Permutation, moveList: MoveList): Permutation {
	const centered = (p: Permutation) => p.apply('U') === 'U' && p.apply('F') === 'F';
	if (centered(perm)) {
		return perm;
	}
	const moves = SLICE_MOVES.find((m) => centered(apply2003(perm, m)));
	if (moves === undefined) {
		throw new Error(`Can't place the centers: ${perm}`);
	}
	const block = moveList.openBlock('Place Centers');
	moveList.appendMoves(moves);
	block.close();
	return apply2003(perm, moves);
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
