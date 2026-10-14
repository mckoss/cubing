// Parse Rubikon source into its syntax tree (see ast.ts and rubikon-json.md).

import { generate, type Parser } from 'peggy';
import grammar from './rubikon.peggy?raw';
import { isLocation } from '../cube/types';
import type { RubikonFile } from './ast';
import { RubikonError } from './values';

// A parse error, with where it happened (1-based).
export class RubikonSyntaxError extends RubikonError {
	constructor(message: string, line: number, column: number) {
		super(message, { line, column });
		this.name = 'RubikonSyntaxError';
	}
}

let parser: Parser | undefined;

function getParser(): Parser {
	parser ??= generate(grammar);
	return parser;
}

// The clockwise spelling of a counterclockwise corner name ("ufr" -> "urf"),
// or undefined if there isn't one.
function clockwise(name: string): string | undefined {
	if (name.length !== 3) {
		return undefined;
	}
	const flipped = name.charAt(0) + name.charAt(2) + name.charAt(1);
	return isLocation(flipped) ? flipped : undefined;
}

interface PeggyError {
	message: string;
	location: { start: { line: number; column: number } };
}

function isPeggyError(e: unknown): e is PeggyError {
	return e instanceof Error && 'location' in e;
}

// Where a program from before 3.0 has a search (`search U* as t`), if it does.
function oldSearch(source: string): { line: number; column: number } | undefined {
	// Comments blanked (same length, so positions hold).
	const code = source.replace(/#.*/g, (comment) => ' '.repeat(comment.length));
	const match = /(?<![\w.])search(?:\s+[A-Za-z]['2]?\*)+\s+as\s/.exec(code);
	if (match === null) return undefined;
	const before = code.slice(0, match.index).split('\n');
	return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

export function parseRubikon(source: string): RubikonFile {
	try {
		return getParser().parse(source, { isLocation, clockwise }) as RubikonFile;
	} catch (e) {
		if (isPeggyError(e)) {
			const old = oldSearch(source);
			if (old !== undefined) {
				throw new RubikonSyntaxError(
					'`search` is now `using` (Rubikon 3.0): using U* as t { … }',
					old.line,
					old.column
				);
			}
			throw new RubikonSyntaxError(e.message, e.location.start.line, e.location.start.column);
		}
		throw e;
	}
}
