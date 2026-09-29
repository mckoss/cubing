// Parse Rubikon source into its syntax tree (see ast.ts and rubikon-json.md).

import { generate, type Parser } from 'peggy';
import grammar from './rubikon.peggy?raw';
import { isLocation } from '../cube/types';
import type { RubikonFile } from './ast';

// A parse error, with where it happened (1-based).
export class RubikonSyntaxError extends Error {
	readonly line: number;
	readonly column: number;

	constructor(message: string, line: number, column: number) {
		super(`${line}:${column}: ${message}`);
		this.name = 'RubikonSyntaxError';
		this.line = line;
		this.column = column;
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

export function parseRubikon(source: string): RubikonFile {
	try {
		return getParser().parse(source, { isLocation, clockwise }) as RubikonFile;
	} catch (e) {
		if (isPeggyError(e)) {
			throw new RubikonSyntaxError(e.message, e.location.start.line, e.location.start.column);
		}
		throw e;
	}
}
