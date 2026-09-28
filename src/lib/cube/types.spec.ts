import { describe, expect, it } from 'vitest';
import { LOCATIONS, isLocation, parseLocation, rotateName } from './types';
import { parseMoves, permutationOf, MOVE_NAMES } from './moves';

describe('types', () => {
	it('lists all 54 stickers once', () => {
		expect(LOCATIONS.length).toBe(54);
		expect(new Set(LOCATIONS).size).toBe(54);
	});

	it('checks names read from text', () => {
		expect(isLocation('ufl')).toBe(true);
		expect(isLocation('lfu')).toBe(false); // counterclockwise: not a name
		expect(isLocation('UFL')).toBe(false);
		expect(parseLocation('bd')).toBe('bd');
		expect(() => parseLocation('fb')).toThrow();
	});

	it('rotates names', () => {
		expect(rotateName('ufl')).toBe('flu');
		expect(rotateName('uf')).toBe('fu');
	});

	it('names every place any move reaches', () => {
		for (const name of MOVE_NAMES) {
			const p = permutationOf(parseMoves(name));
			for (const loc of LOCATIONS) {
				expect(isLocation(p.apply(loc)), `${name} ${loc}`).toBe(true);
			}
		}
	});
});
