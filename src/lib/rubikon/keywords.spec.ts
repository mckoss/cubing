// The keyword list in rubikon.md (§2, written as a poem) is exactly the
// grammar's reserved words: each once, none missing, none extra.

import { describe, expect, it } from 'vitest';
import { parseRubikon } from './parse';
import spec from '../../../rubikon.md?raw';
import grammar from './rubikon.peggy?raw';

function words(text: string): string[] {
	return text.split(/[\s,']+/).filter((w) => /^[a-z]+$/.test(w));
}

const block = /\*\*Keywords\*\*[^\n]*\n\n```\n([\s\S]*?)```/.exec(spec)?.[1] ?? '';
const listed = words(block);
const reserved = words(/KEYWORDS = new Set\(\[([\s\S]*?)\]\)/.exec(grammar)?.[1] ?? '');

describe('keywords', () => {
	it('rubikon.md lists each reserved word once', () => {
		expect(listed.length).toBe(new Set(listed).size);
		expect([...listed].sort()).toEqual([...reserved].sort());
		expect(reserved.length).toBe(27);
	});

	it('no keyword can be a name', () => {
		for (const word of listed) {
			expect(() => parseRubikon(`let ${word} = R`), word).toThrow();
		}
	});
});
