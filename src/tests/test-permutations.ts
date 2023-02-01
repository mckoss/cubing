import { assert } from 'chai';

import { generateScramble, translateMove } from '../permutations.js';

suite('Permutations', () => {
    test('scramble', () => {
        const moves = generateScramble(10);
        assert.equal(moves.length, 10);
        assert.match(moves.join(''), /^[UDLRFB']+$/);
    });

    test('translateMove', () => {
        const move = translateMove('U');
        assert.deepEqual(move, {
            axis: 'y',
            turns: 1,
            selection: {row: -1}, });
    });
});
