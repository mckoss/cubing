// Compile-time tests for alg() and rule(): the type checker (npm run check)
// fails if a valid sequence is rejected, or if any line marked below as an
// expected error is accepted.  Nothing here runs.

import { alg } from './moves';
import { rule } from './singmaster';

export function typeChecks(): void {
	alg("R U R' U'");
	alg("F D2 F'  D2  R' D R"); // groups separated by two spaces
	alg("M' E S2 x y' z2");
	alg('');
	rule('F2 P F2');
	rule("B' U' R2 U2 R2 U2 R2 U2 U B P");

	// @ts-expect-error: Q is not a move
	alg('R Q');
	// @ts-expect-error: lower case r is not a move (wide turns are Rw)
	alg('r U');
	// @ts-expect-error: R3 is not a move
	alg('R3');
	// @ts-expect-error: moves must be separated by spaces
	alg('RU');
	// @ts-expect-error: P (undo) is only allowed in a rule
	alg('F2 P F2');
	// @ts-expect-error: not a literal
	alg(String('R'));
	// @ts-expect-error: X is not a move or P
	rule('F2 X F2');
}
