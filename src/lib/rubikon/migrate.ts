// Bringing programs written for an earlier Rubikon up to date.

import { parseRubikon } from './parse';

function parses(source: string): boolean {
	try {
		parseRubikon(source);
		return true;
	} catch {
		return false;
	}
}

// 3.0 renamed `search` to `using`.  `search X as t { … }` meant exactly what
// `using X as t { … }` means now, so renaming the keyword keeps a program's
// moves.  Only a program that no longer parses, and parses once renamed, is
// changed: since 3.0, `search` can be an ordinary name.
export function migrateSource(source: string): string {
	if (parses(source)) return source;
	const renamed = renameSearch(source);
	return parses(renamed) ? renamed : source;
}

// Before 3.0 `search` was a keyword, so outside comments and strings it
// was the statement.
function renameSearch(source: string): string {
	let out = '';
	let i = 0;
	while (i < source.length) {
		const c = source.charAt(i);
		if (c === '#' || c === '"') {
			// A comment runs to the end of the line; a string to its closing
			// quote, on the same line.
			const end = c === '#' ? source.indexOf('\n', i) : stringEnd(source, i);
			const stop = end === -1 ? source.length : c === '#' ? end : end + 1;
			out += source.slice(i, stop);
			i = stop;
		} else if (
			source.startsWith('search', i) &&
			!isIdentChar(source.charAt(i - 1)) &&
			!isIdentChar(source.charAt(i + 6))
		) {
			out += 'using';
			i += 6;
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

// The closing quote of the string opened at i, or the end of its line if
// it isn't closed there.
function stringEnd(source: string, i: number): number {
	const quote = source.indexOf('"', i + 1);
	const line = source.indexOf('\n', i);
	return line !== -1 && (quote === -1 || line < quote) ? line - 1 : quote;
}

function isIdentChar(c: string): boolean {
	return /^[A-Za-z0-9_]$/.test(c);
}

// The text of each example the playground used to start with, by its short
// hash (racing.ts): a copy still exactly as it was is replaced by the
// current example of the same name.
export const RETIRED_SEEDS: ReadonlySet<string> = new Set([
	'f9c7db69' // basic.rbk before 3.0
]);
