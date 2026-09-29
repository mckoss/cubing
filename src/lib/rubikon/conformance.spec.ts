// Conformance: basic.rbk and the TypeScript Basic solver (beginner.ts) make
// the same moves, stage by stage, on the same scrambles.
//
// Both hold the cube differently along the way (y turns), so the moves are
// compared as they turn the cube as it's shown: a whole cube turn changes
// the frame, and the moves after it are renamed to the faces they really
// turn.  Turns of the same face in a row are merged, so "U U" and "U2"
// agree.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRubikon } from './parse';
import type { RubikonFile } from './ast';
import { renameMove, runMain } from './runtime';
import { Permutation } from '../cube/permutation';
import {
	applyMoves,
	FACES,
	formatMoves,
	isRotation,
	perm,
	permutationOf,
	type Move
} from '../cube/moves';
import type { MoveList } from '../cube/move-list';
import { Beginner } from '../cube/beginner';
import type { Turns } from '../cube/types';

function rbk(name: string): RubikonFile {
	return parseRubikon(
		readFileSync(new URL(`../../../rubikon/${name}.rbk`, import.meta.url), 'utf8')
	);
}

const BASIC = rbk('basic');
const MODULES = new Map([['cfop', rbk('cfop')]]);

// The TypeScript solver's block names, as basic.rbk's descriptions.
const STAGE_NAMES: Record<string, string> = {
	'Basic Modern Solution': 'The Basic Modern Solution',
	'First Face (White)': 'First Face'
};

// A move, and the innermost stage it was made in.
interface Made {
	stage: string;
	move: Move;
}

// The TypeScript solver's moves: a MoveList that only records.
function typescriptMoves(start: Permutation): Made[] {
	const made: Made[] = [];
	const stack: string[] = [];
	const recorder = {
		add(moves: Move[]): void {
			const stage = stack.at(-1) ?? '';
			made.push(...moves.map((move) => ({ stage, move })));
		},
		openBlock(name: string): { close: () => void } {
			stack.push(STAGE_NAMES[name] ?? name);
			return {
				close: (): void => {
					stack.pop();
				}
			};
		}
	};
	new Beginner(recorder as unknown as MoveList).solve(start);
	return made;
}

const LIFT = 'Lift a piece to the top';

// basic.rbk's moves, from its run's events.
function rubikonMoves(start: Permutation): Made[] {
	const made: Made[] = [];
	const stack: string[] = [];
	runMain(
		BASIC,
		start,
		(event) => {
			switch (event.kind) {
				case 'enter':
					stack.push(event.description ?? event.name ?? '');
					break;
				case 'leave':
					stack.pop();
					break;
				case 'move':
					// Lift is a helper, not a stage: its moves belong to the stage
					// that called it.
					made.push({ stage: stack.findLast((s) => s !== LIFT) ?? '', move: event.move.move });
					break;
			}
		},
		MODULES
	);
	return made;
}

// Each stage's moves as they turn the cube as shown: whole cube turns
// change the frame (carried from stage to stage), and turns of one face in
// a row are merged.
function shownByStage(made: Made[]): Map<string, Move[]> {
	let frame = Permutation.identity();
	const stages = new Map<string, Move[]>();
	for (const { stage, move } of made) {
		const moves = stages.get(stage) ?? [];
		stages.set(stage, moves);
		if (isRotation(move.name)) {
			frame = frame.compose(perm(move.name, move.turns));
			continue;
		}
		const shown = renameMove(frame, move);
		const last = moves.at(-1);
		if (last?.name === shown.name) {
			const turns = (last.turns + shown.turns) % 4;
			moves.pop();
			if (turns !== 0) {
				moves.push({ name: shown.name, turns: turns as Turns });
			}
		} else {
			moves.push(shown);
		}
	}
	for (const [stage, moves] of stages) {
		if (moves.length === 0) {
			stages.delete(stage);
		}
	}
	return stages;
}

// A seeded random number generator (mulberry32).
function random(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function scramble(rand: () => number): Permutation {
	const moves: Move[] = Array.from({ length: 30 }, () => ({
		name: FACES[Math.floor(rand() * FACES.length)] ?? 'U',
		turns: (1 + Math.floor(rand() * 3)) as Turns
	}));
	return permutationOf(moves);
}

describe('basic.rbk conforms to the TypeScript Basic solver', () => {
	it('makes the same moves, stage by stage, on 500 scrambles', () => {
		const rand = random(2026);
		const differences: string[] = [];
		let compared = 0;
		for (let i = 0; i < 500; i++) {
			const start = scramble(rand);
			const ts = shownByStage(typescriptMoves(start));
			const rb = shownByStage(rubikonMoves(start));
			const names = new Set([...ts.keys(), ...rb.keys()]);
			for (const name of names) {
				const a = formatMoves(ts.get(name) ?? []);
				const b = formatMoves(rb.get(name) ?? []);
				compared += ts.get(name)?.length ?? 0;
				if (a !== b) {
					differences.push(`scramble ${i}, ${name}:\n  TypeScript: ${a}\n  basic.rbk:  ${b}`);
				}
			}
			// Both solve it.
			const all = (m: Map<string, Move[]>): Move[] => [...m.values()].flat();
			expect(applyMoves(start, all(ts)).toString()).toBe('()');
			expect(applyMoves(start, all(rb)).toString()).toBe('()');
		}
		expect(compared).toBeGreaterThan(500 * 100);
		expect(differences.slice(0, 10).join('\n'), `${differences.length} differences`).toBe('');
	}, 60_000);
});
