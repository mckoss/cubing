// Functions for dealing with permuations and moves
// on a cube.

import MersenneTwister from "mersenne-twister";

import { Move, MOVES } from "./cubies.js";

export { generateScramble, translateMove, mapMoves };

const mt = new MersenneTwister();
mt.init_seed(123);

// A move list is an array of moves.  A move is either
// a single letter (U, D, L, R, F, B) or a letter followed
// by a prime (') or a 2.

// These are the basic quarter-turn moves.
const quarterList = "UDLRFB";

function generateScramble(length: number): string[] {
    const moves: string[] = [];
    for (let i = 0; i < length; i++) {
        let move = quarterList[mt.random_int() % quarterList.length];
        if (mt.random_int() % 2 === 0) {
            move += "'";
        }
        moves.push(move);
    }
    return moves;
}

function translateMove(m: string): Move {
    const move = {...MOVES[m[0]]};
    if (m.length === 2 && m[1] === "'") {
        move.turns = -move.turns;
    }
    return move;
}

function mapMoves(mvs: string[]): Move[] {
    return mvs.map(translateMove);
}
