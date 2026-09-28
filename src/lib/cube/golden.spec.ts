// Both solvers' output, recorded before the 2026 refactoring, so that
// changes to how moves are stored can't change what the solvers do.
//
// To re-record (only when a solver is meant to change):
//   UPDATE_GOLDEN=1 npx vitest run src/lib/cube/golden.spec.ts

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { formatMoves, permutationOf, type Move } from './moves';
import { MoveList, type HistoryBlock } from './move-list';
import { SOLVERS } from './solvers';

const FILE = new URL('./fixtures/solvers-golden.json', import.meta.url);

interface Golden {
	solver: string;
	scramble: string;
	history: unknown[];
}

function random(seed: number): () => number {
	return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

// Random scrambles, some with slice moves and whole cube turns.
function scrambles(): string[] {
	const rand = random(2026);
	const result: string[] = [];
	for (let i = 0; i < 60; i++) {
		const names = i < 40 ? 'UDLRFB' : 'UDLRFBMESxyz';
		const moves = Array.from({ length: 25 }, () => {
			const name = names[Math.floor(rand() * names.length)];
			return name + ['', '2', "'"][Math.floor(rand() * 3)];
		});
		result.push(moves.join(' '));
	}
	return result;
}

function describeHistory(blocks: HistoryBlock[]): unknown[] {
	return blocks.map((b) => ({
		name: b.name,
		faceTurns: b.faceTurns,
		quarterTurns: b.quarterTurns,
		items: b.items.map((item) =>
			Array.isArray(item) ? formatMoves(item as Move[]) : describeHistory([item])[0]
		)
	}));
}

function record(): Golden[] {
	const out: Golden[] = [];
	for (const solver of SOLVERS) {
		for (const scramble of scrambles()) {
			const list = new MoveList();
			solver.solve(permutationOf(scramble), list);
			out.push({ solver: solver.name, scramble, history: describeHistory(list.history()) });
		}
	}
	return out;
}

describe('solver output', () => {
	it('is unchanged', () => {
		const now = record();
		if (process.env.UPDATE_GOLDEN || !existsSync(FILE)) {
			writeFileSync(FILE, JSON.stringify(now, null, 1) + '\n');
		}
		const golden = JSON.parse(readFileSync(FILE, 'utf8')) as Golden[];
		expect(now.length).toBe(golden.length);
		for (let i = 0; i < golden.length; i++) {
			expect(now[i], `${golden[i].solver}: ${golden[i].scramble}`).toEqual(golden[i]);
		}
	});
});
