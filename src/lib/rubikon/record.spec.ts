import { describe, expect, it } from 'vitest';
import { MoveList, type HistoryBlock, type HistoryItem } from '../cube/move-list';
import {
	MOVE_NAMES,
	formatMoves,
	invertMoves,
	parseMoves,
	perm,
	permutationOf
} from '../cube/moves';
import { Permutation } from '../cube/permutation';
import type { Move } from '../cube/types';
import type { RunEvent } from './events';
import { RunRecorder, applyEvents } from './record';
import { parseRubikon } from './parse';
import { physicalMoves, renameMove, runMain } from './runtime';

const loc = { line: 1, column: 1 };
const SOLVED = new Permutation();

// Move events for moves in standard notation; whole cube turns are frame
// changes unless shown.
function moves(text: string, shown = false): RunEvent[] {
	return parseMoves(text).map((move) => ({
		kind: 'move',
		move: { move, visible: shown || !/[xyz]/.test(move.name) },
		loc
	}));
}

const enter = (name: string | null, description: string | null = null): RunEvent => ({
	kind: 'enter',
	name,
	description,
	loc
});
const leave: RunEvent = { kind: 'leave', loc };
const trace = (text: string): RunEvent => ({ kind: 'trace', text, loc });

// The history as plain text: moves, notes as [kind: text], blocks as
// {name: …}.
function describe_(items: HistoryItem[]): string[] {
	return items.map((item) =>
		Array.isArray(item)
			? formatMoves(item)
			: 'note' in item
				? `[${item.note}: ${item.text}]`
				: `{${item.name}: ${describe_(item.items).join(' | ')}}`
	);
}

function historyOf(events: RunEvent[]): string[] {
	const list = new MoveList();
	applyEvents(events, list);
	const [root] = list.history();
	return root === undefined ? [] : describe_(root.items);
}

describe('applyEvents', () => {
	it('adds moves to the history and the moves to play', () => {
		const list = new MoveList();
		applyEvents(moves("R U R' U'"), list);
		expect(formatMoves(list.moves)).toBe("R U R' U'");
		expect(formatMoves(list.pending)).toBe("R U R' U'");
	});

	it('makes a block for each algo, nested, named by its description', () => {
		expect(
			historyOf([
				enter('main', 'The method'),
				...moves('R'),
				enter(null, 'First stage'),
				...moves('U'),
				leave,
				enter('sune'),
				...moves('F'),
				leave,
				leave
			])
		).toEqual(['{The method: R | {First stage: U} | {sune: F}}']);
	});

	it('counts the moves in each block', () => {
		const list = new MoveList();
		applyEvents([enter('a'), ...moves('R U2 x'), leave], list);
		const block = list.history()[0]?.items[0] as HistoryBlock;
		expect(block).toMatchObject({ name: 'a', faceTurns: 2, quarterTurns: 3 });
	});

	it('puts trace lines between the moves, in the open block', () => {
		expect(
			historyOf([
				trace('start'),
				enter('a'),
				...moves('R'),
				trace('after R'),
				...moves("R'"),
				leave,
				trace('done')
			])
		).toEqual(['[trace: start]', "{a: R | [trace: after R] | R'}", '[trace: done]']);
	});

	it("doesn't cancel moves across a trace", () => {
		const list = new MoveList();
		applyEvents([...moves('R'), trace('here'), ...moves("R'")], list);
		expect(list.moves).toHaveLength(2);
	});

	it('keeps an algo with only trace lines', () => {
		expect(historyOf([enter('a'), trace('nothing to do'), leave])).toEqual([
			'{a: [trace: nothing to do]}'
		]);
	});

	it('leaves out an algo that made no moves and traced nothing', () => {
		expect(historyOf([enter('a'), leave, ...moves('U')])).toEqual(['U']);
	});

	it('notes a bypassed algo', () => {
		expect(
			historyOf([{ kind: 'bypass', name: null, description: 'Middle', loc }, ...moves('U')])
		).toEqual(['[bypass: Middle: skipped, its goal already holds]', 'U']);
	});

	it('closes algos left open (by an error) at the end', () => {
		const list = new MoveList();
		expect(() =>
			applyEvents([enter('a'), ...moves('R'), enter('b'), leave, leave, leave], list)
		).toThrow("isn't open");
		applyEvents([enter('c'), ...moves('U')], list);
		expect(list.blocks.every((b) => b.end !== undefined || b.name === 'Move History')).toBe(true);
	});

	it('renames the moves after a whole cube turn, which it leaves out', () => {
		// As in LANGUAGE.md: `do y insertLeft y'` plays insertLeft renamed.
		const list = new MoveList();
		applyEvents(moves("y U' L' U L U F U' F' y'"), list);
		expect(formatMoves(list.moves)).toBe("U' F' U F U R U' R'");
	});

	it('plays a shown whole cube turn, and the moves after it keep their names', () => {
		const list = new MoveList();
		applyEvents([...moves('x', true), ...moves('R U')], list);
		expect(formatMoves(list.moves)).toBe('x R U');
	});

	it('renames a shown whole cube turn made in a turned frame', () => {
		const list = new MoveList();
		applyEvents([...moves('y'), ...moves('x', true), ...moves('R')], list);
		// After y, the cube's x axis is the page's z (turning like F'), and
		// R is B.
		expect(formatMoves(list.moves)).toBe("z' B");
	});

	it("agrees with the runtime's physicalMoves on a run", () => {
		for (const [body, shown] of [
			['do y show(x) R', "z' B"],
			["do y R U y' F show(z) R", 'B U F z R'],
			["do x show(y) z R U show(z')", null]
		] as const) {
			const list = new MoveList();
			const recorder = new RunRecorder(list);
			const { events, state } = runMain(
				parseRubikon(`algo main { ${body} }`),
				SOLVED,
				recorder.listener
			);
			recorder.finish();
			expect(formatMoves(list.moves), body).toBe(formatMoves(physicalMoves(events)));
			if (shown !== null) expect(formatMoves(list.moves), body).toBe(shown);
			// The cube as shown, turned by the frame changes, is the cube as held.
			const hidden = events.flatMap((e) =>
				e.kind === 'move' && !e.move.visible ? [e.move.move] : []
			);
			expect(permutationOf([...list.moves, ...hidden]).equals(state), body).toBe(true);
		}
	});

	it('records a stream one event at a time', () => {
		const list = new MoveList();
		const recorder = new RunRecorder(list);
		for (const event of [enter('a'), ...moves('R')]) recorder.listener(event);
		recorder.finish();
		expect(list.history()[0]?.items).toHaveLength(1);
	});
});

describe("the runtime's renameMove", () => {
	const R: Move = { name: 'R', turns: 1 };

	it('leaves moves alone in the starting frame', () => {
		expect(renameMove(new Permutation(), R)).toEqual(R);
	});

	it('renames every move in every frame to the move it is', () => {
		// Two whole cube turns reach all 24 ways of holding the cube.
		const turns = parseMoves("x x2 x' y y2 y' z z2 z'");
		for (const a of turns) {
			for (const b of turns) {
				const frame = perm(a.name, a.turns).compose(perm(b.name, b.turns));
				for (const name of MOVE_NAMES) {
					for (const t of [1, 2, 3] as const) {
						const move: Move = { name, turns: t };
						// Turning the cube, making the move, and turning it back.
						const expected = permutationOf([a, b, move, ...invertMoves([a, b])]);
						expect(permutationOf([renameMove(frame, move)]).equals(expected)).toBe(true);
					}
				}
			}
		}
	});
});
