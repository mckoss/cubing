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

Every solution must pass one test: after the scramble and the solution's
moves, the cube is solved, however it's held.

```
assert solved(c basic(c))
```

## The model in brief

- **Names are places.** `uf`, `fu`, `urf`, `u` are locations on the cube,
  including which way the piece in them faces.
- **Patterns describe what's in a place.** `/u_/`, `/!u!u/`, `/df/`.
- **A pattern with no wildcards is a cubie:** `/df/` is the down-front
  piece, identified by its colors.
- **`is` tests a place against a pattern:** `uf is /df/` — the df piece is
  at uf, with its d sticker on the u side.
- **Permutations move places:** `(uf ur ub)`, `R(urf)`.
- **Everything is relative to the cube as it's held** (its centers).

## Settled

### Lexical

| Written                                 | Meaning                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `# …`                                   | Comment to the end of the line                                                                                                    |
| `U D L R F B`, `M E S`, `x y z`, `Rw` … | Moves, in standard (WCA) notation: capitals; `'` and `2` are part of the move (`R'`, `U2`); wide turns are `Rw`, never lower case |
| `urf`, `uf`, `u`                        | Locations: lower case face letters                                                                                                |
| `/u__/`, `/df/`, `/u_/r`                | Patterns (see below)                                                                                                              |
| other lower case words                  | Variables and keywords (`x`, `y`, `z` are reserved: they're moves)                                                                |

- Items are separated by spaces, moves included (`R U R' U'`, not `RUR'U'`).
- A variable whose name is only face letters (`fur`, `bud`) is an error: it
  would read as a location.
- Brackets: `( )` are parentheses, `[ ]` brackets, `{ }` braces.

Every special character and its uses:

| Token    | Meaning                                                                          |
| -------- | -------------------------------------------------------------------------------- |
| `#`      | comment to the end of the line                                                   |
| `'` `2`  | part of a move, `R'`, `U2`; `'` also inverts a name or a group: `t'`, `(R U)'`   |
| `( )`    | grouping `(R U)'`; a cycle `(uf ur ub)`; the identity `()`; arguments `order(p)` |
| `+` `-`  | after a cycle: its pieces come back turned, `(urf)+`                             |
| `/ /`    | a pattern, `/u__/`; followed by `r`, any rotation, `/ulb/r`                      |
| `[ ]`    | a face picture, rows separated by `/`: `face U [_u_/uuu/_u_]`                    |
| `_`      | in a pattern or picture: any sticker                                             |
| `!`      | in a pattern or picture: any sticker but, `!u`                                   |
| `{ }`    | a block: `stage "…" goal … { … }`, `each y { … }`                                |
| `->`     | a case and what to do: `case … -> do R U R'`                                     |
| `=` `==` | `let` binding; equality                                                          |
| `,`      | separates arguments and generators: `using y, U`                                 |
| `:`      | in `all c in …: …`                                                               |
| `" "`    | a string: stage names, captions                                                  |

Keywords so far: `solution for stage let fn do each match case otherwise
using turns until max goal if not and or in is all has face` (and, if the
named search is adopted, `find by as at else`).

### Locations

- A **location** (Singmaster's _cubicle_) is a place **and which way the
  piece in it faces**: the first letter says which of the piece's stickers
  is on which face. `uf` and `fu` are the same place, read from different
  stickers; so are `urf`, `rfu`, and `fur`.
- **Corners are named clockwise**, reading the corner's faces clockwise as
  seen from outside the cube. The eight corners are `urf ufl ulb ubr` and
  `dfr dlf dbl drb` (as Singmaster and Kociemba write them), each with its
  three rotations. `ufr` (counterclockwise) is not a name, nor are `fru` or
  `ruf`; a counterclockwise name is an error that suggests the clockwise
  one. Each corner has exactly three names, one per sticker.
- There are 54 locations: 6 centers, 24 edge stickers, 24 corner stickers.
- **All names are relative to the cube as it's held now** (relative to the
  centers): after `y`, `fr` is the place now at the front right. Face turns
  never rename anything; whole cube turns (`x y z`) and slices (`M E S`)
  move the centers, so they rename everything consistently. This is what
  lets `each y { … }` write a rule once for all four sides.

### Colors

- A color is named by the face it belongs on: `u` is "the color of the
  center now on top". There are no color names in rules.
- A color scheme is only for display (the simulator, pictures, captions):
  `colors { u: yellow, f: blue, r: orange, l: red, b: green, d: white }`.

### Patterns and cubies

A **pattern** describes the stickers of a piece, one cell per sticker, read
in the letter order of the place it's tested against:

| Cell | Matches        |
| ---- | -------------- |
| `u`  | the color of u |
| `_`  | anything       |
| `!u` | anything but u |

- **`is`** tests the piece in a place: `uf is /u_/` (the top color faces up
  at uf); `rfu is /u__/` (reading the urf corner from its r sticker, that
  sticker is the top color: yellow faces right).
- **A pattern with no wildcards is a cubie**, identified by its colors:
  `/df/` is the down-front edge. So
  - `uf is /df/`: the df piece is at uf, with its d sticker up;
  - `fu is /df/`: the same piece at the same place, flipped;
  - `df is /df/`: df is home, the right way round (`solved(df)`).
- **`r` means any rotation**: `/df/r` matches the df piece either way round;
  `/ulb/r` the ulb corner in any of its three twists; `/u__/r` any corner
  with a top-color sticker. (A corner has only three clockwise rotations, so
  `/ulb/r` is exactly "the ulb piece, however twisted".) Patterns like
  `/!u!u/` match every rotation anyway.
- **Face pictures**: a pattern for a whole face, as seen looking at it, in
  brackets, rows separated by `/`; each cell is one sticker (`u`, `_`, or
  `!u`), and spaces are optional. Read in a fixed order (for U: back row
  `ulb ub ubr`, then `ul u ur`, then front `ufl uf urf`):

  ```
  face U [_!u_ / uuu / _!u_]          # the line, left to right
  face U [ _ !u _ /  u u u  / _ !u _ ] # the same, spaced out
  ```

  Negative cells make cases exclusive, so case order doesn't matter.

### Permutations

- **Cycle notation** on locations, printed and read the same way (what the
  page shows can be pasted back): `(uf ur ub) (urf)+`.
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

| Expression  | Types             | Result   | Meaning                                                         |
| ----------- | ----------------- | -------- | --------------------------------------------------------------- |
| `p q`       | Perm, Perm        | Perm     | p, then q (left to right, like moves; as in GAP)                |
| `p(q)`      | Perm, Perm        | Perm     | q, then p (inside out, like functions)                          |
| `p(uf)`     | Perm, Location    | Location | where the piece at uf ends up                                   |
| `p'`        | Perm              | Perm     | the inverse of p (a name or a group: `t'`, `(R U)'` is `U' R'`) |
| `R'`, `R2`  | move              | Move     | part of a single move: `R'` is the inverse of R, `R2 == R R`    |
| `p == q`    |                   | Bool     | same effect                                                     |
| `uf == fu`  | Location          | Bool     | same place, same facing (false here)                            |
| `uf is /…/` | Location, Pattern | Bool     | the piece at uf matches the pattern                             |
| `uf is c`   | Location, Cubie   | Bool     | the piece at uf is the (physical) cubie c                       |

- **No power notation.** Repeats are written out (`p p p`), or named first
  (`let sexy = R U R' U'`, then `sexy sexy`). The inverse is `'`; `R2` stays
  as part of a single move, as in standard notation.
- Applying a bare move (`R(U)`) is allowed but warned against: it reads
  backwards (`R(U(R'(U')))` is `U' R' U R`).
- `==` never looks inside a place; `is` always does.

### Functions

| Function      | Returns                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `order(p)`    | the order of p                                                                                              |
| `inverse(p)`  | `p'`                                                                                                        |
| `legal(p)`    | whether some sequence of moves makes p (flip parity, twist sum, permutation parity)                         |
| `solved(x …)` | for places, each holds its own piece the right way round (`x is /x/`); for a cube, solved however it's held |
| `placed(x …)` | each place holds its own piece, however twisted (`x is /x/r`)                                               |
| `location(p)` | where the piece matching a complete pattern (or a cubie) is, facing so that it matches                      |
| `cubie(x)`    | the physical piece in place x now (a Cubie value, to follow through turns)                                  |
| `slot(x)`     | the place's home name, ignoring facing: `slot(fu) == uf`, `slot(fur) == urf`                                |

`location(/df/) is /df/` is always true: it names the place with the facing
that matches.

### Types

Location, Pattern, Cubie, Permutation (a cube state is one), Sequence (a
permutation that remembers its moves, so it can be played; any sequence can
be used as a permutation, not the reverse), Int, Bool.

- A **Pattern** is read relative to the centers: after `y`, `/fr/` is the
  piece that now belongs at the front right.
- A **Cubie** is a physical piece, from `cubie(x)`, that keeps its identity
  through whole cube turns: `let piece = cubie(df)`, then later
  `location(piece)`. Printed as the complete pattern that matches it now.

### Solved

- A cube is solved when every place holds its own piece the right way
  round, **however the cube is held**: any of the 24 whole cube turns of the
  identity counts. A solution doesn't need to turn the cube back at the end.
- Centers have no visible orientation, so the model has none.
- Slice moves displace the centers relative to the other pieces; that's a
  real difference, not a way of holding the cube, so a slice scramble still
  needs its centers put back ("Place Centers").

### Structure and control

| Construct                        | Meaning                                                                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solution basic for cube3 { … }` | a solution for a puzzle                                                                                                                                         |
| `stage "Middle" goal … { … }`    | a named stage with its goal (see Stages)                                                                                                                        |
| `let name = …`                   | single assignment                                                                                                                                               |
| `do R U R'`                      | play moves (the only thing that changes the cube)                                                                                                               |
| `each y { … }`                   | do the block 4 times, turning y after each (`each U` turns the top)                                                                                             |
| `match { case … -> … }`          | first matching case wins; `-> ()` means "nothing to do"                                                                                                         |
| `using U match { … }`            | search: try each case; if none match, turn U and try again (up to 3 more times); `turns` is the moves the search made, so `turns'` undoes them (Singmaster's P) |
| `otherwise -> …`                 | when nothing matches                                                                                                                                            |
| `until <cond> max n { … }`       | retry a block; `until goal max n` repeats until the stage's goal holds                                                                                          |
| `if <cond> { … }`                | plain condition                                                                                                                                                 |
| `fn name(p) = …`                 | small helper returning a sequence                                                                                                                               |

### Stages

A stage names a sub-goal of the solution, **for documentation and
display**: it shows which part of the move sequence accomplishes what.

- The simulator's history groups moves by stage ("Top Cross: 14 moves"),
  with turn counts for each, and "next stage" steps through them.
- The file reads the way the method is taught: first face, middle layer,
  top cross, …
- Stages don't change which moves are made: without them, a solution makes
  exactly the same moves.
- Stages nest (Bottom Edges inside First Face).

**Every stage states its goal**, an assertable invariant for the part of
the solution it names:

```
stage "Middle" goal solved(layer(D) layer(E)) { … }
```

- **Checked at the end:** when the stage finishes, its goal must hold, or
  the solve stops with an error naming the stage.
- **Skipped when already true:** a stage whose goal holds at the start
  makes no moves (this replaces `skip if`).
- **Goals accumulate:** at the end of each stage, the goals of the stages
  before it at the same level must still hold, so a stage can disturb
  earlier work along the way (Twist Corners scrambles the bottom) but must
  restore it by its end.
- **Goals keep their frame:** a goal is checked in the orientation the cube
  had when its stage ran; the runtime accounts for later whole cube turns
  (Singmaster's `z2`), so "the top layer is solved" still means that layer
  after the cube is turned over.
- **Each stage can be tested alone:** start from random cubes where the
  earlier goals hold, run the stage, check its goal.
- The page can show each stage's goal next to its moves.

### Generalization

Keep a puzzle-independent core (permutations, patterns, control) and put
everything puzzle-specific in a puzzle definition: face letters, place
names, moves, whole-puzzle turns, face-picture reading order, color scheme,
`legal`. `solution basic for cube3`. The parser must not hard-code `udfblr`
or the move list.

## Open questions

1. **Name** of the language.
2. **Composition in two directions.** `p q` is left to right, `p(q)` inside
   out. Both are useful, but mixed carelessly they read in opposite
   directions (`R(U)F(U)` is `U R U F`, not `U F U R`). Options: keep both
   (current), restrict application to names (`R(U)` an error), drop `p(q)`
   for permutations and keep function syntax for functions only (a
   reviewer's recommendation), or add a forward keyword (`p then q`).
3. **Commutators and conjugates.** Cubers write `[A, B] = A B A' B'` and
   `[A: B] = A B A'`; GAP's `Comm(a, b)` and `a^b` are the other way round.
   Use cubers' brackets (which now also mean face pictures, though a comma
   or colon inside would tell them apart), function
   names (`commutator`, `conjugate`), or just write them out?
4. _(Resolved: `'` inverts names and groups, e.g. `t'`, `(R U)'`; there is
   no `^`.)_
5. **Searches: `using U match` vs. a named search.** Proposal:
   ```
   find /uf/ by U as t {
     at uf -> t F2 t' F2
     at fu -> t F t' U' R U
   }
   ```
   - `find` looks for a complete pattern (a piece); `at` names where it is.
   - The search is named (`t`), so its undo is visible (`t'`), unlike P.
   - Explicit (`t` written where it's done) or implicit (`bring … as t`
     does `t` first)? Leaning explicit.
   - `by U, y`: search several moves, shortest first, to a depth limit;
     the order must be fixed so solutions are repeatable.
   - Several targets in one search (Singmaster tries `uf` and `fu`
     together at each turn; separate searches could give different moves).
   - When nothing is found: an explicit `else`, not silently skipping.
   - If adopted, `using U match` becomes a special case, or goes away.
6. **`each`** as the keyword for "4 times, turning after each"?
   (Alternatives: `for each y`, `4 times then y`.)
7. **Face pictures: minimal or complete?** For matching, `_` means "don't
   care". The page's case pictures show a whole plausible cube; the page
   could fill the `_` cells in. Side tabs (a bigger picture including the side stickers) for the
   side colors of the top edges?
8. **Captions and pictures in the file:** should each case carry its "what
   to look for" text and picture, so the page's method section is generated
   from the same file as the solver?
9. **Statements vs. expressions:** keep `do` the only thing with an effect,
   and everything else pure?
10. **Whole cube turns: physical or virtual?** The same rules can emit `y`
    (as you'd do it by hand) or rename the moves instead (fewer moves, as
    speedcubers do): `solution basic(turns: virtual)`.
11. **Twist-agnostic cycles:** `/…/r` covers single places; Place D Corners
    needs "these corners cycle, ignoring twists". `positions(cube) has
(ufl ulb ubr)`, or a flag on the cycle?
12. **Pattern details:** a way to write "either f or r" in a cell (a
    character class like `[fr]` would clash with face pictures' brackets);
    whether `is not` reads better than `not (… is …)`; which face a picture
    without `face U` would mean.
13. **Searching two generators:** `using y, U match` (each y, then each U),
    needed by Top Edges.
14. **Output:** the JSON the compiler produces isn't designed yet.
15. **Rotations and locations (a tension to resolve):** permutations are
    read relative to the centers, so a whole cube turn doesn't rearrange any
    piece (`x == ()`), yet it changes which place `urf` names
    (`y(urf) == ufl` as the cube is held). Decide whether `x y z` are
    permutations of locations, or a separate "frame" that's not a
    permutation at all.
16. **Other puzzles:** "solved however held" is already the right
    definition for the 2×2 and 4×4 (no fixed centers), but they still need a
    reference for naming places; indexes for places that share faces
    (`uf.1`, `uf.2`); pieces that look alike (patterns on colors work;
    tests on which physical piece is where don't); layer moves (`2R`,
    `3Rw`); the pyraminx's lower case tip moves clash with lower case place
    names; face pictures for triangles; a sticker-numbered engine (as GAP
    does) under the names.

## Problems with the current design

- **P hides what it undoes** (in the TypeScript tables today, and in the
  language if `using … match` keeps an unnamed `turns`): `rule("F2 P F2")`
  means nothing without the generator two lines up. The `find … as t`
  proposal fixes it; the tables were left as they are for now.
- **Two composition orders** (open question 2).
- **Case order** matters for plain boolean tests (the line pattern also
  matches the cross); negative cells in pictures fix it, but tests written
  with `and` still depend on order.
- **Names change** with whole cube turns and slices. Intended, but
  surprising; to follow one physical piece, take `cubie(x)` first.
- **Patterns read in the place's letter order,** so some tests read
  backwards at first: `rfu is /u__/` means "yellow faces right" (reading
  the urf corner from its r sticker).
- **The 2003 quirks** the TypeScript solvers keep for move-for-move
  compatibility (half turns always clockwise, `U2 U` written out, quarter
  turns recorded in the 2003 directions) don't belong in the language.

## Discarded

| Idea                                                                | Why                                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The 2003 notation (`ruRU`: lower case clockwise; `i j k` rotations) | Replaced everywhere by standard notation                                                                       |
| Upper case piece names (`URF`)                                      | Reads as moves U R F; Singmaster used lower case                                                               |
| Corner names in either winding (`ufr` as well as `urf`)             | Six spellings per corner; clockwise only gives exactly three, one per sticker                                  |
| Bare names as cubies, `@urf` for locations                          | Permutations move places, so places get the plain names; a cubie is a complete pattern, `/urf/`                |
| `home(c)` (or `target(c)`, `c.home`)                                | Not needed: a complete pattern's letters are its home                                                          |
| `&c` / `*loc` (address and dereference)                             | `*&df == df` would be true only when df is home, unlike a pointer; `cubie(x)` and `location(p)` say it plainly |
| `loc.cubie`, `c.home` (properties)                                  | Plain functions instead; no new syntax                                                                         |
| `=~` for matching                                                   | Looks like "not equal"; `is` reads as English                                                                  |
| `==` comparing a place with a piece                                 | `==` would mean two things; `is` looks inside a place, `==` never does                                         |
| Bare patterns (`u_`, `u__`)                                         | Hard to tell from names; `/…/` marks them                                                                      |
| `~=` (same piece, any twist)                                        | Now the `r` flag: `ubr is /ulb/r`                                                                              |
| Face pictures in braces with spaced cells (`face U { _ u _ / … }`)  | Brackets with `/` between rows read as a two-dimensional pattern: `face U [_u_/uuu/_u_]`                       |
| Lists of places in brackets (`[uf ur ub ul] is [...]`)              | Brackets are for face pictures; functions take several places: `solved(uf ur ub ul)`                           |
| "Solved" meaning the identity (`c m == ()`)                         | Any way of holding a solved cube counts                                                                        |
| Cubies named by color (`$ybo`), `#` as their mark                   | `#` is for comments; names relative to the centers make rules work on every side                               |
| Permanent names (a letter always means one color)                   | The meaning of `u` would split after `x`; rules must follow the cube as held                                   |
| `where(c)`                                                          | Sounds like a loop; now `location(p)`                                                                          |
| `solvable(p)`                                                       | Sounds like it returns moves; now `legal(p)` (a yes/no check)                                                  |
| `sticker(x)`                                                        | Replaced by patterns: `uf is /u_/`                                                                             |
| `skip if <cond>`                                                    | A stage's goal: a stage whose goal already holds is skipped                                                    |
| `around y`                                                          | Renamed `each y` (open)                                                                                        |
| `search U { … }`                                                    | Now `using U match` (and maybe `find … by U as t`)                                                             |
| `*` for composition                                                 | Suggests order doesn't matter; side by side is used                                                            |
| Sequences in brackets with commas `[R, U, F]`                       | Reads as the commutator `[R, U]`, and arrays with commas imply a different order convention                    |
| Powers: `p^3`, `p^-1` (and `p3`, `(…)x3`, `p*3`)                    | Another notation for little gain: write repeats out (`p p p`) and invert with `'`                              |
| GAP's `i^p` for "where i goes"                                      | Function notation `p(uf)` chosen                                                                               |
| `<Identity>`                                                        | `()`                                                                                                           |
| Moves without spaces (`RUR'U'`)                                     | Spaces everywhere, one rule                                                                                    |
| A `Notation` string type in the code                                | Sequences are `Move[]`; text only at the edges; `alg("…")` checked at compile time                             |

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
  let twistCorner      = R' D' R D R' D' R D
  let twistCornerBack  = D' R' D R D' R' D R

  # Moving a piece to the top without disturbing the bottom.
  fn edgeUp(x) = match slot(x) {
    case df -> F2           case fr -> R U R'
    case dr -> R2           case br -> R' U R
    case db -> B2           case bl -> L U L'
    case dl -> L2           case fl -> L' U L
  }
  fn cornerUp(x) = match slot(x) {
    case dfr -> R U R'      case dbl -> L U L'
    case drb -> R' U' R     case dlf -> L' U' L
  }

  stage "First Face" goal solved(layer(D)) {

    stage "Bottom Edges" goal solved(df dr db dl) {
      each y {
        if not solved(df) {
          if location(/df/) not in layer(U) { do edgeUp(location(/df/)) }
          using U match {
            case uf is /df/ -> do F2                  # its bottom color up
            case fu is /df/ -> do U' R' F R           # its bottom color facing front
          }
        }
      }
    }

    stage "Bottom Corners" goal solved(layer(D)) {
      each y {
        if not solved(dfr) {
          if location(/dfr/) not in layer(U) { do cornerUp(location(/dfr/)) }
          using U match {
            case rfu is /dfr/ -> do R U R'             # bottom color facing right
            case fur is /dfr/ -> do F' U' F            # bottom color facing front
            case urf is /dfr/ -> do R U2 R' U' R U R'  # bottom color up
          }
        }
      }
    }
  }

  stage "Middle" goal solved(layer(D) layer(E)) {
    each y {
      # Stuck in the wrong middle slot: turn the cube to it and kick it out.
      if location(/fr/) in layer(E) and not solved(fr) {
        match slot(location(/fr/)) {
          case fr -> do insertRight
          case br -> do y insertRight y'
          case bl -> do y2 insertRight y2
          case fl -> do y' insertRight y
        }
      }
      if not solved(fr) {
        using U match {
          case fu is /fr/ -> do insertRight           # front color in front
          case ur is /fr/ -> do y insertLeft y'       # right color on the right
        }
      }
    }
  }

  stage "Top Cross" goal face U [_u_ / uuu / _u_] {
    until goal max 4 {
      using U match {
        case face U [_!u_ / uuu  / _!u_] -> do topCross   # line
        case face U [_u_  / uu!u / _!u_] -> do topCross   # L, back left
        case face U [_!u_ / !uu!u / _!u_] -> do topCross  # dot
      }
    }
  }

  stage "Top Edges" goal solved(uf ur ub ul) {
    until goal max 3 {
      using y, U match {
        case solved(uf ur ub ul)                                    -> ()
        case uf is /ul/ and ul is /uf/ and solved(ub ur)            -> do swapEdges
        case uf is /ub/ and ub is /uf/ and solved(ul ur)            -> do swapEdges
      }
    }
  }

  stage "Top Corners" goal placed(urf ufl ulb ubr) {
    until goal max 3 {
      using y match {
        case ubr is /ulb/r and ulb is /ufl/r and ufl is /ubr/r -> do cycleCorners
        case ulb is /ubr/r and ubr is /urf/r and urf is /ulb/r -> do cycleCornersBack
        otherwise                                              -> do cycleCorners
      }
    }
  }

  stage "Twist Corners" goal solved(cube) {
    each U {                                   # turn the top, not the cube
      match {
        case rfu is /u__/ -> do twistCorner     # top color facing right
        case fur is /u__/ -> do twistCornerBack # top color facing front
        case urf is /u__/ -> ()
      }
    }
  }
}
```

The twist stage is simpler than the TypeScript: a pattern on colors
(`rfu is /u__/`) instead of finding which corner is at the front right. The
first face's case places could be derived from the sequences
(`inverse(F2)(df)` is `uf`) and checked by the compiler.

### Singmaster (sketch)

Singmaster solves the top layer first (white on top), turns the cube over
(`z2`), and finishes the other layers. With the named search of open
question 5:

```
solution singmaster for cube3 {

  stage "Solve U Edges" goal solved(uf ur ub ul) {
    each y {
      find /uf/ by D as t  { at df -> t F2
                             at fd -> t F' U' R U }
      find /uf/ by E' as t { at lf -> t F t'
                             at rf -> t F' t' }
      find /uf/ by U as t  { at uf -> t F2 t' F2
                             at fu -> t F t' U' R U }
    }
  }

  stage "Solve U Corners" goal solved(layer(U)) {
    each y {
      find /urf/ by D as t { at rdf -> t D F D' F'
                             at frd -> t D' R' D R
                             at dfr -> t F D' F' R' D2 R }
      find /urf/ by U as t { at urf -> t F D F' t' F D' F'
                             at rfu -> t R' D2 R t' F D2 F'
                             at fur -> t F D2 F' t' R' D2 R }
    }
  }

  do z2

  stage "Solve Middle Edges" goal solved(layer(D) layer(E)) {   # after z2
    each y {
      if not solved(rf) {                       # stuck in the middle: lift it out
        find /rf/ by E' as t { at rf -> t B' U' R2 U2 R2 U2 R2 U2 U B t'
                               at fr -> t L U' F2 U2 F2 U2 F2 U2 U L' t' }
      }
      find /rf/ by U as t    { at ub -> t B' U' R2 U2 R2 U2 R2 U2 U B
                               at lu -> t L U' F2 U2 F2 U2 F2 U2 U L' }
    }
  }

  stage "Orient D Edges" goal face U [_u_ / uuu / _u_] {   # the new top
    using y match {
      case face U [_u_  / uuu   / _u_ ] -> ()
      case face U [_!u_ / uuu   / _!u_] -> do B L U L' U' B'
      case face U [_!u_ / !uuu  / _u_ ] -> do B U L U' L' B'   # front and right
      case face U [_!u_ / !uu!u / _!u_] -> do B L U L' U' B' y2 B U L U' L' B'
    }
  }

  stage "Place D Edges" goal solved(uf ur ub ul) {
    using y, U match {                          # cycles of the top edges
      case cube has (uf ur ub)      -> do R2 D' U2 R' L F2 R L' D R2
      case cube has (uf ub ur)      -> do R2 D' R' L F2 R L' U2 D R2
      case cube has (uf ur) (ul ub) -> do R2 D2 B2 D L2 F2 L2 F2 L2 F2 D' B2 D2 R2
      case solved(uf ur ub ul)    -> ()
    }
  }

  stage "Place D Corners" goal placed(urf ufl ulb ubr) {
    using y match {                             # positions only, twists ignored
      case positions(cube) has (ufl ulb ubr)         -> do L' U R U' R' L R U R' U'
      case positions(cube) has (ufl ubr ulb)         -> do U R U' R' L' R U R' U' L
      case positions(cube) has (ufl urf) (ulb ubr)   -> do B L U L' U' L U L' U' L U L' U' B'
      case positions(cube) has (ufl ubr) (urf ulb)   -> do R' B2 F R F' R' F R F' R' F R F' R' B2 R
    }
  }

  stage "Orient D Corners" goal solved(cube) {
    each U {
      match {
        case rfu is /u__/ -> do D F D' F' D F D' F'    # counterclockwise
        case fur is /u__/ -> do F D F' D' F D F' D'    # clockwise
        case urf is /u__/ -> ()
      }
    }
  }

  # The 2003 program turns the cube back (z2); "solved however held" makes
  # that optional.
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
- Leaving out the final `z2` changes the recorded moves, so the golden test
  would need the TypeScript solver changed the same way (or the `z2` kept).

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
   if open question 8 says so.
