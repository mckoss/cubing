// The Move Catalog from the 2003 Rubik's Cube Simulator: useful sequences
// in the 2003 notation, with the labels from Mike's notes.

import { from2003Notation, formatMoves, type Move } from './moves';

export interface CatalogEntry {
	label: string;
	// As written in 2003 (lower case clockwise, upper case counterclockwise).
	original: string;
	moves: Move[];
	notation: string;
}

const CATALOG_2003: [string, string][] = [
	['ff', '1a'],
	['FUru', '1b'],
	['DRdr', '2a'],
	['dfDF', '2b'],
	['fddF dd Rdr', '2c'],
	['lu uuffuuffuuff UL', '3a'],
	['Bu rruurruurruu Ub', '3b'],
	['b luLU B', '4a'],
	['b ulUL B', '4b'],
	['rrD uuRlffrL drr', '6bi'],
	['rrD RlffrLuu drr', '6bii'],
	['rrddbbd llffllffllff Dbbddrr', '6c'],
	['L urUR l ruRU', '7bi'],
	['urUR L ruRU l', '7bii'],
	['b luLU luLU luLU B', '7c'],
	['Rbb frFR frFR frFR bbr', '7d'],
	['fdFD fdFD', '8a'],
	['dfDF dfDF', '8b'],
	['ffuu ffuu ffuu', 'P1(f,u)'],
	['fuFU', 'P2(f,u)'],
	['fuFU fuFU', 'P3(f,u) = P2(f,u)^2'],
	['fuFU fuFU fuFU', 'P4(f,u) = P2(f,u)^3'],
	['Rl ff rL uu', '']
];

export const CATALOG: CatalogEntry[] = CATALOG_2003.map(([original, label]) => {
	// Keep the grouping of the original: a space there is a space here.
	const moves = from2003Notation(original);
	const notation = original
		.split(' ')
		.map((group) => formatMoves(from2003Notation(group)))
		.join('  ');
	return { label, original, moves, notation };
});
