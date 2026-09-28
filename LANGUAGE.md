# A Language for Cube Solutions — Design Notes

Status: **design in progress, nothing implemented.** This collects the
design discussion so far: what's settled, what's open, what was tried and
dropped, and how the two solvers on the site would be written. Syntax in
the examples is a draft.

The name is open too (working names: RCSL, Cubit, Twisty, SOLV, CuDL).

## Goal

Replace the hand-written rule tables in `singmaster.ts` and `beginner.ts`
with a small language for describing how a person solves the cube: stages,
the patterns to look for, and the sequences to apply. A solution file is
compiled (a PEG grammar, with [Peggy](https://peggyjs.org), the successor
of the PEG.js used in [Bolt](https://github.com/mckoss/bolt)) to JSON, and
the simulator runs the JSON.

```
basic.cube  --(Peggy parser + compiler)-->  basic.json  --(solver runtime)-->  moves
```

Every solution must pass the same test the solvers pass today:

```
assert c basic(c) == ()          # the cube, then the moves: solved
```

## Settled

### Lexical

| Written                                 | Meaning                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `# …`                                   | Comment to the end of the line                                                                                                    |
| `U D L R F B`, `M E S`, `x y z`, `Rw` … | Moves, in standard (WCA) notation: capitals; `'` and `2` are part of the move (`R'`, `U2`); wide turns are `Rw`, never lower case |
| `urf`, `uf`, `u`                        | Cubies: lower case face letters                                                                                                   |
| `@urf`                                  | Locations (see below)                                                                                                             |
| other lower case words                  | Variables and keywords (`x`, `y`, `z` are reserved: they're moves)                                                                |

- Items are separated by spaces, moves included (`R U R' U'`, not `RUR'U'`).
- A variable whose name is only face letters (`fur`, `bud`) is an error: it
  would read as a cubie.
- Brackets: `( )` are parentheses, `[ ]` brackets, `{ }` braces.

### Cubies and locations

- A **cubie** is a piece, named by its home: `urf`. The order of the letters
  picks a sticker, so `rfu` is the same piece read from its r sticker; this
  is how orientation is written.
- **Corners are named clockwise**, reading the corner's faces clockwise as
  seen from outside the cube: `urf`, `rfu`, and `fur` all name the up-right-
  front corner, but `ufr` (counterclockwise) is not a name, and neither are
  its rotations `fru` and `ruf`. The eight corners are `urf ufl ulb ubr` and
  `dfr dlf dbl drb` (as Singmaster and Kociemba write them). This gives each
  corner exactly three names, one per sticker, and keeps a name's rotations
  meaningful: rotating a clockwise name gives the same corner from the next
  sticker. A counterclockwise name is an error that suggests the clockwise
  one.
- A **location** (Singmaster's _cubicle_) is a place, with which way the
  piece in it faces: `@urf`, `@rfu`. `@` is our invention; the literature
  uses the same name for both and relies on context.
- **All names are relative to the cube as it's held now** (relative to the
  centers): after `y`, `fr` means the piece that now belongs at the front
  right, and `@fr` the place now at the front right. Face turns never rename
  anything; whole cube turns (`x y z`) and slices (`M E S`) move the centers,
  so they rename everything consistently. This is what lets `each y { … }`
  write a rule once for all four sides.
- To follow one physical piece through rotations, bind it:
  `let piece = cubie(@df)`.

### Colors

- A color is named by the face it belongs on: `u` is "the color of the up
  center". There are no color names in rules, so `@uf == u_` means "the top
  color faces up at uf".
- A color scheme is only for display (the simulator, pictures, captions):
  `colors { u: yellow, f: blue, r: orange, l: red, b: green, d: white }`.

### Permutations

- **Cycle notation**, printed and read the same way (what the page shows can
  be pasted back): `(uf ur ub) (urf)+`.
- Letter order is orientation: `(uf ub)` swaps two edges; `(uf bu)` swaps
  them and flips both.
- A suffix means the pieces come back turned: `+` once (corners clockwise,
  edges flipped), `-` twice (corners). E.g. `(urf)+` twists a corner in place.
- **Identity:** `()`.
- **Order:** the least common multiple of the cycle orders; a cycle of _n_
  pieces has order _n_, or 3*n* (corners) / 2*n* (edges) with a suffix.
  E.g. `R U` is `(rfu)+ (rub rbd rdf flu lbu)- (ru rb rd rf fu lu bu)`,
  order lcm(3, 15, 7) = 105.
- A move, a sequence of moves, and a cube state are all permutations; a
  cube state is the permutation that takes a solved cube to it.

### Operators

| Expression | Types          | Result   | Meaning                                                        |
| ---------- | -------------- | -------- | -------------------------------------------------------------- |
| `p q`      | Perm, Perm     | Perm     | p, then q (left to right, like moves; as in GAP)               |
| `p(q)`     | Perm, Perm     | Perm     | q, then p (inside out, like functions)                         |
| `p(@x)`    | Perm, Location | Location | where the piece at x ends up                                   |
| `p^n`      | Perm, Int      | Perm     | p repeated; `p^-1` is the inverse; `p^0` is `()`               |
| `R'`, `R2` | move           | Move     | part of a single move: `R' == R^-1 == inverse(R)`, `R2 == R^2` |
| `p == q`   |                | Bool     | same effect                                                    |

- `p^3`, not `p3`, `p*3`, or `(…)x3`.
- Applying a bare move (`R(U)`) is allowed but warned against: it reads
  backwards (`R(U(R'(U')))` is `U' R' U R`).
- `p(urf)` (a permutation applied to a cubie) is a type error: permutations
  move places. Use `home(urf)`, or `location(urf)` for the current cube.

### Functions

| Function      | Returns                                                                             |
| ------------- | ----------------------------------------------------------------------------------- |
| `order(p)`    | the order of p                                                                      |
| `inverse(p)`  | `p^-1`                                                                              |
| `legal(p)`    | whether some sequence of moves makes p (flip parity, twist sum, permutation parity) |
| `home(c)`     | the location cubie c belongs in: `home(urf) == @urf`                                |
| `location(c)` | where cubie c is now (in the current cube)                                          |
| `cubie(@x)`   | which cubie is in place x now                                                       |

### Types

Cubie, Location, Permutation (a cube state is one), Sequence (a permutation
that remembers its moves, so it can be played; any sequence can be used as a
permutation, not the reverse), Int, Bool.

### Patterns

- `@uf == u_`: the piece at uf, read from the sticker facing u, has the top
  color there; `_` is a wildcard. `@fr == fr` (home and right way round),
  `@fr == rf` (home, flipped), `@urf == u__`.
- `!u`: anything but u. `{f r}`: either.
- Lists of places: `[@uf @ur @ub @ul] == [u_ !u_ u_ !u_]`.
- **Face pictures**, read in a fixed order (for U: back row `@ulb @ub @ubr`,
  then `@ul @u @ur`, then front `@ufl @uf @urf`):

  ```
  face U {
    _  !u  _
    u   u  u        # the line, left to right
    _  !u  _
  }
  ```

  One line: `face U { _ !u _ / u u u / _ !u _ }`. Negative cells make cases
  exclusive, so case order doesn't matter.

### Structure and control

| Construct                        | Meaning                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solution basic for cube3 { … }` | a solution for a puzzle                                                                                                                                           |
| `stage "Middle" { … }`           | a named stage (shown in the history)                                                                                                                              |
| `let name = …`                   | single assignment                                                                                                                                                 |
| `do R U R'`                      | play moves (the only thing that changes the cube)                                                                                                                 |
| `each y { … }`                   | do the block 4 times, turning y after each (`each U` turns the top)                                                                                               |
| `match { case … -> … }`          | first matching case wins; `-> ()` means "nothing to do"                                                                                                           |
| `using U match { … }`            | search: try each case; if none match, turn U and try again (up to 3 more times); `turns` is the moves the search made, so `turns^-1` undoes them (Singmaster's P) |
| `otherwise -> …`                 | when nothing matches                                                                                                                                              |
| `until <cond> max n { … }`       | retry a block                                                                                                                                                     |
| `skip if <cond>`                 | skip a stage                                                                                                                                                      |
| `if <cond> { … }`                | plain condition                                                                                                                                                   |
| `fn name(p) = …`                 | small helper returning a sequence                                                                                                                                 |

### Generalization

Keep a puzzle-independent core (permutations, patterns, control) and put
everything puzzle-specific in a puzzle definition: face letters, piece and
place names, moves, whole-puzzle turns, face-picture reading order, color
scheme, `legal`. `solution basic for cube3`. The parser must not hard-code
`udfblr` or the move list.

## Open questions

1. **Name** of the language.
2. **Cycle elements:** a permutation moves _places_, but cycles have always
   been written with bare names. Either
   - strict: `@(ulb ufl ubr)` (or `(@ulb @ufl @ubr)`), or
   - one syntactic rule, like an assignment's left side: inside a cycle's
     parentheses, names are places — `(ulb ufl ubr)`, the standard form.

   The page's display should match whichever is chosen.

3. **Composition in two directions.** `p q` is left to right, `p(q)` inside
   out. Both are useful, but mixed carelessly they read in opposite
   directions (`R(U)F(U)` is `U R U F`, not `U F U R`). Options: keep both
   (current), restrict application to names (`R(U)` an error), or add a
   forward keyword (`p then q`, or `p ; q`).
4. **Commutators and conjugates.** Cubers write `[A, B] = A B A' B'` and
   `[A: B] = A B A'`; GAP's `Comm(a, b)` and `a^b` are the other way round.
   Use function names (`commutator`, `conjugate`)? Or just write them out?
5. **`'` on names:** allow `prep'` as short for `prep^-1` (needed by the
   `find` proposal below)?
6. **Searches: `using U match` vs. a named search.** Proposal:
   ```
   find uf by U as t {
     at @uf -> t F2 t' F2
     at @fu -> t F t' U' R U
   }
   ```
   - The search is named (`t`), so its undo is visible (`t'`), unlike P.
   - Explicit (`t` written where it's done) or implicit (`bring … as t`
     does `t` first)? Leaning explicit.
   - `by {U, y}`: search several moves, shortest first, to a depth limit;
     the order must be fixed so solutions are repeatable.
   - Several targets in one search (Singmaster tries `@uf` and `@fu`
     together at each turn; separate searches could give different moves).
   - When nothing is found: an explicit `else`, not silently skipping.
   - If adopted, `using U match` becomes a special case, or goes away.
7. **`each`** as the keyword for "4 times, turning after each"?
   (Alternatives: `for each y`, `4 times then y`.)
8. **Face pictures: minimal or complete?** For matching, `_` means "don't
   care". The page's case pictures show a whole plausible cube; the page
   could fill the `_` cells in. Side tabs (`face U with sides { … }`) for the
   side colors of the top edges?
9. **Captions and pictures in the file:** should each case carry its "what
   to look for" text and picture, so the page's method section is generated
   from the same file as the solver?
10. **Statements vs. expressions:** keep `do` the only thing with an effect,
    and everything else pure?
11. **Whole cube turns: physical or virtual?** The same rules can emit `y`
    (as you'd do it by hand) or rename the moves instead (fewer moves, as
    speedcubers do): `solution basic(turns: virtual)`.
12. **Twist-agnostic tests:** `@ubr ~= ulb` (same piece, any twist) and
    `positions(p)` (a permutation with twists removed) — the syntax.
13. **Searching two generators:** `using y, U match` (each y, then each U),
    needed by Top Edges.
14. **Output:** the JSON the compiler produces isn't designed yet.
15. **Rotations and locations (a tension to resolve):** permutations are
    read relative to the centers, so a whole cube turn doesn't rearrange any
    cubie (`x == ()`), yet it changes which place `@urf` names
    (`y(@urf) == @ufl` as the cube is held). Decide whether `x y z` are
    permutations of locations, or a separate "frame" that's not a
    permutation at all.
16. **Other puzzles:** the reference frame without fixed centers (2×2,
    4×4); indexes for pieces that share faces (`uf.1`, `uf.2`); pieces that
    look alike (patterns on colors work; tests on which piece is where
    don't); layer moves (`2R`, `3Rw`); the pyraminx's lower case tip moves
    clash with lower case cubies; face pictures for triangles; a
    sticker-numbered engine (as GAP does) under the names.

## Problems with the current design

- **P hides what it undoes** (in the TypeScript tables today, and in the
  language if `using … match` keeps an unnamed `turns`): `rule("F2 P F2")`
  means nothing without the generator two lines up. The `find … as t`
  proposal fixes it; the tables were left as they are for now.
- **Two composition orders** (open question 3).
- **Case order** matters for plain boolean tests (the line pattern also
  matches the cross); negative cells in pictures fix it, but tests written
  with `and` still depend on order.
- **Cubie names change** with whole cube turns and slices. Intended, but
  surprising; code that wants one physical piece must bind it first.
- **Cubie and Location share their spelling** (`urf` vs `@urf`); the type
  checker must keep them apart, and `home` is needed to cross between them.
- **The 2003 quirks** the TypeScript solvers keep for move-for-move
  compatibility (half turns always clockwise, `U2 U` written out, quarter
  turns recorded in the 2003 directions) don't belong in the language.

## Discarded

| Idea                                                                | Why                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| The 2003 notation (`ruRU`: lower case clockwise; `i j k` rotations) | Replaced everywhere by standard notation                                                    |
| Upper case piece names (`URF`)                                      | Reads as moves U R F; Singmaster used lower case                                            |
| Corner names in either winding (`ufr` as well as `urf`)             | Six spellings per corner; clockwise only gives exactly three, one per sticker               |
| Cubies named by color (`$ybo`), `#` as their mark                   | `#` is for comments; names relative to the centers make rules work on every side            |
| Permanent cubie identity (a letter always means one color)          | The meaning of `u` would split after `x`; rules must follow the cube as held                |
| `where(c)`                                                          | Sounds like a loop; now `location(c)`                                                       |
| `solvable(p)`                                                       | Sounds like it returns moves; now `legal(p)` (a yes/no check)                               |
| `sticker(@x)`                                                       | Replaced by patterns: `@uf == u_`                                                           |
| `around y`                                                          | Renamed `each y` (open)                                                                     |
| `search U { … }`                                                    | Now `using U match` (and maybe `find … by U as t`)                                          |
| `*` for composition                                                 | Suggests order doesn't matter; side by side is used                                         |
| Sequences in brackets with commas `[R, U, F]`                       | Reads as the commutator `[R, U]`, and arrays with commas imply a different order convention |
| `p3`, `(…)x3`, `p*3`                                                | `p^3` only                                                                                  |
| GAP's `i^p` for "where i goes"                                      | Function notation `p(@x)` chosen                                                            |
| `<Identity>`                                                        | `()`                                                                                        |
| Moves without spaces (`RUR'U'`)                                     | Spaces everywhere, one rule                                                                 |
| A `Notation` string type in the code                                | Sequences are `Move[]`; text only at the edges; `alg("…")` checked at compile time          |

## How the current solvers would be written

### Basic Modern Solution (complete draft)

```
# basic.cube: the Basic Modern Solution, as in Mike's notes.
# All names are relative to the cube as it's held.

solution basic for cube3 {

  let insertRight      = U R U' R' U' F' U F
  let insertLeft       = U' L' U L U F U' F'
  let topCross         = F R U R' U' F'
  let swapEdges        = R U R' U R U2 R' U
  let cycleCorners     = U R U' L' U R' U' L
  let cycleCornersBack = U' L' U R U' L U R'
  let twistCorner      = (R' D' R D)^2
  let twistCornerBack  = (D' R' D R)^2

  # Moving a piece to the top without disturbing the bottom.
  fn edgeUp(p) = match slot(p) {
    case @df -> F2          case @fr -> R U R'
    case @dr -> R2          case @br -> R' U R
    case @db -> B2          case @bl -> L U L'
    case @dl -> L2          case @fl -> L' U L
  }
  fn cornerUp(p) = match slot(p) {
    case @dfr -> R U R'     case @dbl -> L U L'
    case @drb -> R' U' R    case @dlf -> L' U' L
  }

  stage "First Face" {
    skip if solved(layer(D))

    stage "Bottom Edges" {
      each y {
        if not solved(df) {
          if location(df) not in layer(U) { do edgeUp(location(df)) }
          using U match {
            case location(df) == @uf -> do F2                # white up
            case location(df) == @fu -> do U' R' F R         # white facing front
          }
        }
      }
    }

    stage "Bottom Corners" {
      each y {
        if not solved(dfr) {
          if location(dfr) not in layer(U) { do cornerUp(location(dfr)) }
          using U match {
            case location(dfr) == @rfu -> do R U R'              # white facing right
            case location(dfr) == @fur -> do F' U' F             # white facing front
            case location(dfr) == @urf -> do R U2 R' U' R U R'   # white up
          }
        }
      }
    }
  }

  stage "Middle" {
    each y {
      # Stuck in the wrong middle slot: turn the cube to it and kick it out.
      if location(fr) in layer(E) and not solved(fr) {
        match slot(location(fr)) {
          case @fr -> do insertRight
          case @br -> do y insertRight y'
          case @bl -> do y2 insertRight y2
          case @fl -> do y' insertRight y
        }
      }
      if not solved(fr) {
        using U match {
          case location(fr) == @fu -> do insertRight
          case location(fr) == @ur -> do y insertLeft y'
        }
      }
    }
  }

  stage "Top Cross" {
    until face U { _ u _ / u u u / _ u _ } max 4 {
      using U match {
        case face U { _ !u _ /  u u  u / _ !u _ } -> do topCross   # line
        case face U { _  u _ /  u u !u / _ !u _ } -> do topCross   # L, back left
        case face U { _ !u _ / !u u !u / _ !u _ } -> do topCross   # dot
      }
    }
  }

  stage "Top Edges" {
    until solved(edges(U)) max 3 {
      using y, U match {
        case @uf == uf and @ur == ur and @ub == ub and @ul == ul -> ()
        case @uf == ul and @ul == uf and @ub == ub and @ur == ur -> do swapEdges
        case @uf == ub and @ub == uf and @ul == ul and @ur == ur -> do swapEdges
      }
    }
  }

  stage "Top Corners" {
    until all c in corners(U): @c ~= c max 3 {
      using y match {
        case @ubr ~= ulb and @ulb ~= ufl and @ufl ~= ubr -> do cycleCorners
        case @ulb ~= ubr and @ubr ~= urf and @urf ~= ulb -> do cycleCornersBack
        otherwise                                         -> do cycleCorners
      }
    }
  }

  stage "Twist Corners" {
    each U {                                   # turn the top, not the cube
      match {
        case @rfu == u__ -> do twistCorner     # yellow facing right
        case @fur == u__ -> do twistCornerBack # yellow facing front
        case @urf == u__ -> ()
      }
    }
  }
}
```

The twist stage is simpler than the TypeScript: a pattern on colors
(`@rfu == u__`) instead of finding which corner is at the front right. The
first face's case places could be derived from the sequences
(`inverse(F2)(@df)` is `@uf`) and checked by the compiler.

### Singmaster (sketch)

Singmaster solves the top layer first (white on top), turns the cube over
(`z2`), and finishes the other layers. With the named search of open
question 6:

```
solution singmaster for cube3 {

  stage "Solve U Edges" {
    each y {
      find uf by D as t  { at @df -> t F2
                           at @fd -> t F' U' R U }
      find uf by E' as t { at @lf -> t F t'
                           at @rf -> t F' t' }
      find uf by U as t  { at @uf -> t F2 t' F2
                           at @fu -> t F t' U' R U }
    }
  }

  stage "Solve U Corners" {
    each y {
      find urf by D as t { at @rdf -> t D F D' F'
                           at @frd -> t D' R' D R
                           at @dfr -> t F D' F' R' D2 R }
      find urf by U as t { at @urf -> t F D F' t' F D' F'
                           at @rfu -> t R' D2 R t' F D2 F'
                           at @fur -> t F D2 F' t' R' D2 R }
    }
  }

  do z2

  stage "Solve Middle Edges" {
    each y {
      if not solved(rf) {                       # stuck in the middle: lift it out
        find rf by E' as t { at @rf -> t B' U' R2 U2 R2 U2 R2 U2 U B t'
                             at @fr -> t L U' F2 U2 F2 U2 F2 U2 U L' t' }
      }
      find rf by U as t    { at @ub -> t B' U' R2 U2 R2 U2 R2 U2 U B
                             at @lu -> t L U' F2 U2 F2 U2 F2 U2 U L' }
    }
  }

  stage "Orient D Edges" {                      # the (new) top: which edges show u?
    using y match {
      case face U { _ u _ / u u u / _ u _ }     -> ()
      case face U { _ !u _ / u u u / _ !u _ }   -> do B L U L' U' B'
      case face U { _ !u _ / !u u u / _ u _ }   -> do B U L U' L' B'   # front and right
      case face U { _ !u _ / !u u !u / _ !u _ } -> do B L U L' U' B' y2 B U L U' L' B'
    }
  }

  stage "Place D Edges" {
    using y, U match {                          # cycles of the top edges
      case cube has (uf ur ub)      -> do R2 D' U2 R' L F2 R L' D R2
      case cube has (uf ub ur)      -> do R2 D' R' L F2 R L' U2 D R2
      case cube has (uf ur) (ul ub) -> do R2 D2 B2 D L2 F2 L2 F2 L2 F2 D' B2 D2 R2
      case solved(edges(U))         -> ()
    }
  }

  stage "Place D Corners" {
    using y match {                             # positions only, twists ignored
      case positions(cube) has (ufl ulb ubr)         -> do L' U R U' R' L R U R' U'
      case positions(cube) has (ufl ubr ulb)         -> do U R U' R' L' R U R' U' L
      case positions(cube) has (ufl urf) (ulb ubr)   -> do B (L U L' U')^3 B'
      case positions(cube) has (ufl ubr) (urf ulb)   -> do R' B2 (F R F' R')^3 B2 R
    }
  }

  stage "Orient D Corners" {
    each U {
      match {
        case @rfu == u__ -> do (D F D' F')^2    # counterclockwise
        case @fur == u__ -> do (F D F' D')^2    # clockwise
        case @urf == u__ -> ()
      }
    }
  }

  do z2
}
```

Things the Singmaster sketch shows the language needs to pin down:

- `cube has (…)` — whether the cycle is read as the cube's permutation or
  its inverse (the TypeScript `hasMap` paths read "the piece at uf goes to
  ur"), and how several cycles combine.
- The Orient D Edges patterns are read from the current code; the exact
  pictures need checking against the 2003 table when this is built.
- Singmaster's searches try each target at every turn; `find` with several
  targets preserves that (and so the solver's exact moves, which the golden
  test checks).

## Implementation plan (when the design settles)

1. The Peggy grammar and a parser producing an AST, with tests of every
   construct above.
2. A compiler from the AST to JSON: names resolved, sequences parsed to
   moves, patterns compiled to tests.
3. A runtime in the simulator that executes the JSON.
4. `basic.cube` and `singmaster.cube`, replacing `beginner.ts` and
   `singmaster.ts`; the golden test (`solvers-golden.json`) must pass
   unchanged, move for move.
5. Generate the page's method section (captions, pictures) from the file,
   if open question 9 says so.
