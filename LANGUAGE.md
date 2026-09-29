# Rubikon — a Language for Cube Solutions: Design Notes

Status: **design in progress, nothing implemented.** This collects the
design discussion so far: what's settled, what's open, what was tried and
dropped, and how the two solvers on the site would be written. Syntax in
the examples is a draft.

The language is called **Rubikon** (Rubik + Rubicon); files use the
extension `.rbk`.

## Goal

Replace the hand-written rule tables in `singmaster.ts` and `beginner.ts`
with a small language for describing how a person solves the cube: algos,
the patterns to look for, and the sequences to apply. A solution file is
compiled (a PEG grammar, with [Peggy](https://peggyjs.org), the successor
of the PEG.js used in [Bolt](https://github.com/mckoss/bolt)) to JSON, and
the simulator runs the JSON.

```
basic.rbk  --(Peggy parser + compiler)-->  basic.json  --(solver runtime)-->  moves
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
  piece, identified by its colors, with an orientation (d read first).
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
| `Pattern`, `Moves`, `Int` …             | Types: capitalized words longer than a move; all are keywords (see Types)                                                         |
| other lower case words                  | Variables and keywords (`x`, `y`, `z` are reserved: they're moves)                                                                |

- Items are separated by spaces, moves included (`R U R' U'`, not `RUR'U'`).
- A variable whose name is only face letters (`fur`, `bud`) is an error: it
  would read as a location.
- Brackets: `( )` are parentheses, `[ ]` brackets, `{ }` braces.

Every special character and its uses:

| Token    | Meaning                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ |
| `#`      | comment to the end of the line                                                                   |
| `'` `2`  | part of a move, `R'`, `U2`; `'` also inverts a name or a group: `t'`, `(R U)'`                   |
| `N`      | a number after `)` repeats the group: `(R U R' U')3`                                             |
| `( )`    | grouping `(R U)'`, `(R U R' U')3`; a cycle `(uf ur ub)`; the identity `()`; arguments `order(p)` |
| `< >`    | a conjugate: `F<R U>` is `F R U F'`                                                              |
| `+` `-`  | after a cycle: its pieces come back turned, `(urf)+`                                             |
| `/ /`    | a pattern, `/u__/`; followed by `r`, any rotation, `/ulb/r`                                      |
| `*`      | after a generator in a search: zero or more of that turn, `U*`, `y* U*`                          |
| `[ ]`    | a face picture, rows separated by `/`: `face U [_u_/uuu/_u_]`                                    |
| `_`      | in a pattern or picture: any sticker                                                             |
| `!`      | in a pattern or picture: any sticker but, `!u`                                                   |
| `{ }`    | a block: `algo "…" goal … { … }`, `each y { … }`                                                 |
| `->`     | a case and what to do: `case … -> do R U R'`                                                     |
| `=` `==` | `let` binding; equality                                                                          |
| `,`      | separates arguments, `commutator(R, U)`, and imported names, `from cfop import sexy, sune`       |
| `.`      | a name from a module: `cfop.sune`                                                                |
| `:`      | a type: `p: Pattern`, a function's result `fun f(…): Int`; in `all c in …: …`                    |
| `" "`    | a string: an algo's description, captions                                                        |

Keywords so far: `algo goal let fun return do each match search
as case otherwise else until max if not and or in is all has face import
from`.
Types are keywords too: `Location EdgeLocation CornerLocation
CenterLocation Pattern Cubie Edge Corner Center Permutation Moves Orient Face
Slice Set Int Bool`.

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
- **A pattern with no wildcards names a piece and its orientation**, by
  its colors: `/df/` is the down-front edge, read d first. So
  - `uf is /df/`: the df piece is at uf, with its d sticker up;
  - `fu is /df/`: the same piece at the same place, flipped;
  - `df is /df/`: df is home, the right way round (`solved(df)`).
- **`r` means any rotation**: `/df/r` matches the df piece either way round;
  `/ulb/r` the ulb corner in any of its three twists; `/u__/r` any corner
  with a top-color sticker. (A corner has only three clockwise rotations, so
  `/ulb/r` is exactly "the ulb piece, however twisted".) Patterns like
  `/!u!u/` match every rotation anyway.
- **A complete pattern is a cubie:** `/df/` is the df piece with an
  orientation (its d sticker is read first), just as a location has a
  facing: `/df/` and `/fd/` are the same piece, oriented two ways, as `uf`
  and `fu` are the same place. `/df/r` leaves the orientation open, so it's
  a pattern, not a cubie; so is `/u__/r`, which could be several pieces.
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
  E.g. `R U` is `(uf ul ub ur br dr fr) (urf)+ (ufl ulb ubr bdr dfr)-`,
  order lcm(7, 3, 15) = 105.
- **One spelling:** a cycle can be written from any of its pieces, and
  with every name rotated alike, so the engine always prints the same
  choice. Cycles come in order of their first piece (U edges, U
  corners, D edges, D corners, middle edges, centers). Each is spelled with
  as many names as possible read from U or D (F or B for middle edges),
  then starting with such a name, then from the earliest piece.
- A move, a sequence of moves, and a cube state are all permutations; a
  cube state is the permutation that takes a solved cube to it.

### Operators

| Expression  | Types             | Result   | Meaning                                                         |
| ----------- | ----------------- | -------- | --------------------------------------------------------------- |
| `p q`       | Perm, Perm        | Perm     | p, then q (left to right, like moves; as in GAP)                |
| `p(q)`      | Perm, Perm        | Perm     | q, then p (inside out, like functions)                          |
| `p(uf)`     | Perm, Location    | Location | where the piece at uf ends up                                   |
| `w<p>`      | Perm, Perm        | Perm     | the conjugate w p w': p set up with w, then put back            |
| `p'`        | Perm              | Perm     | the inverse of p (a name or a group: `t'`, `(R U)'` is `U' R'`) |
| `R'`, `R2`  | move              | Move     | part of a single move: `R'` is the inverse of R, `R2 == R R`    |
| `p == q`    |                   | Bool     | same effect                                                     |
| `uf == fu`  | Location          | Bool     | same place, same facing (false here)                            |
| `uf is /…/` | Location, Pattern | Bool     | the piece at uf matches the pattern                             |
| `uf is c`   | Location, Cubie   | Bool     | the piece at uf is the (physical) cubie c                       |

- **Repeats:** a number straight after a closing parenthesis repeats the
  group, like `R2` on a single move: `(R U R' U')3` is `R U R' U'` three
  times, `(sexy)2` a name twice. No space before the number (`(R U) 3` is an
  error). A name alone can't take a number (`sexy3` would be a different
  name), so it's written `(sexy)3`. The inverse is `'`: `(R U)'`, or
  `(R U)3'` for the inverse of three repeats.
- **Conjugates:** `w<p>` is `w p w'`, read "p, set up with w". The
  brackets say what is wrapped, and it reads in the order the moves happen.
  The wrapper is one term: a move, a name, or a group, with any `'` or
  repeat (`U'<R>`, `(R' B2)<(commutator(F, R))3>`, `t<F>`, `y<insertLeft>`);
  `U R<L'>` is `U` then `R<L'>`. The whole conjugate is one term too:
  `F<R U>'` is `F U' R' F'`, and `(F<R U>)2` repeats all of it. Conjugates
  nest: `t<F<D>>` is `t F D F' t'`.
- Applying a bare move (`R(U)`) is allowed but warned against: it reads
  backwards (`R(U(R'(U')))` is `U' R' U R`).
- `==` never looks inside a place; `is` always does. A place and a pattern for a
  different kind of piece never match. When the compiler knows both
  kinds, it's an error (`df is /dfr/`: an EdgeLocation against a Corner);
  when it doesn't (a `Cubie` parameter), the test is simply false.

### Functions

| Signature                               | Meaning                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `order(p: Permutation): Int`            | the order of p                                                                         |
| `inverse(p: Moves): Moves`              | `p'` (for a Permutation, a Permutation)                                                |
| `legal(p: Permutation): Bool`           | whether some sequence of moves makes p (flip parity, twist sum, permutation parity)    |
| `commutator(a: Moves, b: Moves): Moves` | `a b a' b'` (cubers' order): `commutator(R, U)` is `R U R' U'`                         |
| `reflect(p: Moves, s: Slice): Moves`    | p seen in a mirror through the slice's plane: `reflect(U R U', M)` is `U' L' U`        |
| `solved(x: Location…): Bool`            | each place holds its own piece the right way round (`x is /x/`)                        |
| `solved(c: Permutation): Bool`          | the cube is solved, however it's held: `solved(cube)`                                  |
| `placed(x: Location…): Bool`            | each place holds its own piece, however twisted (`x is /x/r`)                          |
| `layer(f: Face): Set(Location)`         | the places of a layer, home spellings (`d df dr db dl dfr drb dbl dlf`)                |
| `location(p: Pattern): Location`        | where the piece matching a complete pattern is, facing so that it matches              |
| `location(c: Cubie): Location`          | where that piece is, spelled so its orientation matches: `uf is location(c)` reads `c` |
| `cubie(x: Location): Cubie`             | the physical piece in place x now (to follow through turns)                            |
| `show(t: Orient): Moves`                | the whole cube turn t, tagged to be shown when played (see Whole cube turns)           |

`Location…` takes any number of places, and a `Set(Location)` counts as
its members: `solved(df dr db dl)`, `solved(layer(D))`.

`commutator` follows cubers' convention; GAP's `Comm(a, b)` is `a' b' a b`.
Its arguments aren't a thing and a wrapper: swapping them gives the
inverse (`commutator(b, a)` is `commutator(a, b)'`). A commutator does
contain a conjugate, though: `a b a' b'` is `a<b>` then `b'`. (GAP's
conjugate `a^b` is `b' a b`, the wrapper on the other side.)

`reflect(p, M)` mirrors p through the plane of the M slice, between L
and R. The faces on either side swap (R and L), and every turn goes the
other way, because a mirror reverses clockwise: `R` becomes `L'`, `U`
becomes `U'`. `E` mirrors top and bottom (U and D), and `S` front and back
(F and B). The plane is named by its slice rather than by the axis
through it (`x`), so it can't be read as a whole cube turn. For a
permutation written as cycles, each location is mirrored, and corner names
are respelled clockwise (the mirror of `urf` reads `ufl`), which also
swaps each corner's `+` and `-`.

A mirror is not a move: nothing can be turned to make it. The mirror of a
sequence, though, is a sequence, and it does the mirror image of the
original's job: Basic's `insertLeft` is `reflect(insertRight, M)`, and
`cycleCornersBack` is `reflect(cycleCorners, M)`. Where the mirror image of
a job is the same job done backwards, the inverse is the simpler relation:
`twistCornerBack` is `twistCorner'`.

`location(/df/) is /df/` is always true: it names the place with the facing
that matches.

### Types

Types are keywords, written with a capital letter:

| Type            | Values                                                                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Location`      | a place, with facing: `uf`, `fu`, `urf`; its kinds are `EdgeLocation`, `CornerLocation`, `CenterLocation`                                                 |
| `Pattern`       | `/df/`, `/u__/`, `/ulb/r`                                                                                                                                 |
| `Cubie`         | one piece with an orientation: a complete pattern (`/df/`, `/fd/`), or from `cubie(x)`; its kinds are `Edge`, `Corner`, `Center`                          |
| `Permutation`   | cycles, `(uf ur ub)`; a cube state is one (`cube`)                                                                                                        |
| `Moves`         | a sequence of moves, `R U R' U'`: a permutation that remembers its moves, so it can be played (any `Moves` can be used as a permutation, not the reverse) |
| `Face`          | `U D F B L R`, as in `layer(D)`                                                                                                                           |
| `Orient`        | one whole cube turn, a reorientation: `x`, `y'`, `z2`, as in `show(x)`                                                                                    |
| `Slice`         | `M E S`, as in `reflect(p, M)`                                                                                                                            |
| `Set(Location)` | several places: `layer(D)`                                                                                                                                |
| `Int`, `Bool`   | numbers and truth values; a condition (`uf is /df/`, a face picture) is a Bool                                                                            |

The kinds form a hierarchy; a value of a type can be used wherever its
parent is expected:

```
Pattern          /d_/  /u__/  /!u_/  /df/r     anything between slashes
└── Cubie        /df/  /fd/  /urf/             one piece, with an orientation
    ├── Edge     /df/  /fd/
    ├── Corner   /urf/  /rfu/
    └── Center   /u/

Location         uf  fu  urf  u
├── EdgeLocation     uf  fu
├── CornerLocation   urf  rfu  fur
└── CenterLocation   u
```

- **Every function states its types:** each parameter and the result;
  an algo, each parameter.
  `fun f(p: Pattern): Int { … }`, `algo lift(p: Pattern) { … }`. The
  compiler checks every call
  and every use of the result.
- Where a `Face` or `Slice` is expected, a move letter names the face or
  slice, not the turn: `layer(D)`, `reflect(p, M)`.
- A `let` may state its type (`let t: Moves = …`) but needn't: it's the
  type of what it's given. A search's `as t` is of type `Moves`.
- A **Pattern** is read relative to the centers: after `y`, `/fr/` is the
  piece that now belongs at the front right.
- A **Cubie** is a piece with an orientation. Written as a pattern
  (`/df/`), it's read relative to the centers, like any pattern. From
  `cubie(x)`, it's the piece in x, oriented as x reads it, and it follows
  that physical piece through whole cube turns: `let piece = cubie(df)`,
  then later `location(piece)`; it prints as the pattern that names it now.
- `==` on cubies includes the orientation, as on locations: `/df/ == /fd/`
  is false, like `uf == fu`.
- **Kinds catch mistakes:** `df is /dfr/` is an error (an EdgeLocation
  against a Corner).

### Solved

- A cube is solved when every place holds its own piece the right way
  round, **however the cube is held**: any of the 24 whole cube turns of the
  identity counts. A solution doesn't need to turn the cube back at the end.
- Centers have no visible orientation, so the model has none.
- Slice moves displace the centers relative to the other pieces; that's a
  real difference, not a way of holding the cube, so a slice scramble still
  needs its centers put back ("Place Centers").

### Structure and control

| Construct                                | Meaning                                                                                                                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `algo main "…" goal solved(cube) { … }`  | an algo: a name, a description, and a goal, each optional; `main` runs when the file runs (see Algos)                                                                                                                                              |
| `algo "Middle" goal … { … }`             | an algo inside another: a stage of it                                                                                                                                                                                                              |
| `let name = …`                           | single assignment                                                                                                                                                                                                                                  |
| `do R U R'`                              | play moves (the only thing that changes the cube)                                                                                                                                                                                                  |
| `each y { … }`                           | the block 4 times, always, turning y after each: "for every side". With a whole cube turn it makes no moves of its own; with a face turn (`each U`) it really turns between passes. (Unlike `search`, which stops at the first match.)             |
| `match { case … -> … }`                  | the first true case does its action (`case br is /fr/r -> do y<insertRight>`); cases are conditions, with no subject. With no `otherwise`, nothing matching is an error, as in `search`. `-> ()` means "nothing to do"; cases never produce values |
| `search U* as t { case … }`              | try the cases with zero turns, then after each further turn (see Searches); the turns found are named `t` and are made only where written: `do t F2`                                                                                               |
| `… else search D* as t { … }`            | if the first search finds nothing, try another                                                                                                                                                                                                     |
| `do show(z2)`                            | a visible whole cube turn (see Whole cube turns)                                                                                                                                                                                                   |
| `otherwise -> …`                         | when nothing matches                                                                                                                                                                                                                               |
| `until <cond> max n { … }`               | retry a block; `until goal max n` repeats until the algo's goal holds                                                                                                                                                                              |
| `if <cond> { … }`                        | plain condition                                                                                                                                                                                                                                    |
| `fun name(p: Type): Type { … return … }` | a pure helper: computes a value, never moves the cube; `return` gives its result                                                                                                                                                                   |
| `algo name(p: Type) "…" { … }`           | an algo with parameters: defined here, run where another algo calls it (`do lift(/df/r)`)                                                                                                                                                          |

### Searches

```
search U* as t {
  case uf is /df/ -> do t F2
  case fu is /df/ -> do t U' R' F R
}
```

- **`U*` is zero or more U turns**, borrowed from regular expressions, and
  searched **shortest first**: nothing, then the quarter turns (clockwise
  before counterclockwise), then the half turn. So `U*` and `U'*` are the
  same search, and a search never makes three quarter turns where one will
  do. A turn's order bounds it, so the search is finite and repeatable.
- `y* U*` searches two generators: every U turn within every y turn.
- For each candidate, the cases are tested as if the turns had been made;
  the first match wins.
- **The turns found are named (`as t`) and are made only where the case
  writes them:** `do t F2`. Nothing is done implicitly, so the undo is
  visible too: `do t F2 t' F2` (Singmaster's P).
- **Nothing found is an error**, unless there's an `otherwise` case, or an
  `else search …` to try next.

### Whole cube turns

- **`x y z` change the frame, not the cube.** They make no moves in the
  solution: the moves after them come out renamed. `do y insertLeft y'` is
  output as `insertLeft` with its letters renamed (`U' F' U F U R U' R'`),
  with no `y`. This keeps playback steady: the cube never spins between
  steps.
- **`show(x)` tags one turn as visible.** `show(t: Orient): Moves` takes
  a single whole cube turn (`x`, `y'`, `z2`) and gives it as a visible turn;
  the tag stays with it, so it can be built into a sequence: `let aPerm =
show(x) R' U R' D2 R U' R' D2 R2 show(x')`. When `do` plays moves, a
  tagged turn is shown (the cube visibly turns, and the moves after it keep
  their names), and an untagged one is a change of frame, as above. For
  when a method tells you to turn the cube (Singmaster's "turn it over":
  `do show(z2)`), or when a published alg turns it and a person would too.
  Visible turns should be rare. `show(R)` and `show(x y)` are type errors:
  face turns are always visible, and each shown turn is tagged by itself.
- A cube state never contains a whole cube turn; names are relative to the
  frame, so `y` is a renaming of places, not a permutation of pieces.

### Algos

An algo is a named, described part of a method, with its goal:

```
algo [name[(parameters)]] ["Description"] [goal predicate] { … }
```

All are optional (parameters need a name). A method is an algo, and its stages are algos
inside it:

```
algo main "The Basic Modern Solution" goal solved(cube) {
  algo "First Face" goal solved(layer(D)) {
    algo "Bottom Edges" goal solved(df dr db dl) { … }
    algo "Bottom Corners" goal solved(dfr drb dbl dlf) { … }
  }
  algo "Middle" goal solved(fr fl br bl) { … }
  …
}
```

Algos are **for documentation and display**: they show which part of the
move sequence accomplishes what.

- The simulator's history groups moves by algo ("Top Cross: 14 moves"),
  with turn counts for each, and "next stage" steps through them.
- The file reads the way the method is taught: first face, middle layer,
  top cross, …
- Algos don't change which moves are made: without the nesting, a method
  makes exactly the same moves.
- **Names:** a name (`basic`) lets the algo be referred to: by tests, in
  the trace, and perhaps by other files (open question 17). The
  description is what the page shows; without one, the name is shown.

**Algos with parameters are like macros.** An algo with a parameter list
is defined where it's written, not run there; it runs where another algo
calls it with `do`, as if its body were written at the call. The trace
shows the call as its own step, with its description:

```
algo lift(p: Pattern) "Lift a piece to the top" {
  match {
    case df is p -> do F2           case fr is p -> do R<U>
    …
    otherwise    -> ()               # already in the top layer
  }
}
…
do lift(/df/r)
```

An algo without parameters inside another (a stage) runs where it's
written. Only `do` moves the cube, whether it plays a sequence or runs an
algo; a `fun` never does.

**Running a file runs its `main`.** Algos at a file's top level are
definitions: they run only when called. `algo main` is the one that runs
when the file itself is run (the page lists each file with a `main` as a
method, by its description). A file without one, like `cfop.rbk`, is a
library. Importing a file never runs anything, and another file can run a
method as a step of its own:

```
import basic
do basic.main
```

**Every algo's goal is an assertable invariant** for the part of the
method it covers:

- **Checked at the end:** when the algo finishes, its goal must hold, or
  the solve stops with an error naming the algo.
- **Skipped when already true:** an algo whose goal holds at the start is
  bypassed: its body doesn't run and it makes no moves (this replaces
  `skip if`). The trace still lists it, marked as already done ("Bottom
  Corners: already solved"), so every stage shows up in the solution. So
  an algo needn't test for its own goal: a case that matches only when the
  goal already holds is dead code, and the compiler can warn about one it
  can see (e.g. a case whose pattern is the goal itself).
- **Goals persist to the end of the method:** once an algo's goal
  is reached, it must hold at the end of **every** later algo, nested or
  not, until the whole method is done. The runtime checks all of them at
  each algo's end, and a failure names both the algo that broke the goal
  and the algo that set it. An algo can still disturb earlier work along
  the way (Twist Corners scrambles the bottom) as long as it's restored by
  its end. So the goals build up to the method's own goal.
- **So a goal states only what its algo adds:** Bottom Corners' goal is
  `solved(dfr drb dbl dlf)`, not `solved(layer(D))`; the bottom edges are
  already held by Bottom Edges' goal. An algo that groups others (First
  Face) can state the whole of what they reach, and the method's goal,
  `solved(cube)`, states the whole claim (and is the one goal that allows
  any way of holding the cube).
- A method that deliberately undoes earlier work would have to say so
  (e.g. a `releases` clause on the algo); neither of ours does.
- **Goals keep their frame:** a goal is checked in the orientation the cube
  had when its algo ran; the runtime accounts for later whole cube turns
  (Singmaster's `z2`), so "the top layer is solved" still means that layer
  after the cube is turned over.
- **Each algo can be tested alone:** start from random cubes where the
  earlier goals hold, run the algo, check its goal.
- The page can show each algo's goal next to its moves.

### Modules and imports

A file is a module, named by its file name: `cfop.rbk` is `cfop`. A module
holds definitions at its top level (`let`, `fun`, and `algo`), and any of
them can be imported: `from cfop import sune`, `do basic.main`. [`rubikon/cfop.rbk`](rubikon/cfop.rbk) holds well-known
sequences (Sune, the sexy move, the PLLs), with where each was published.

As in Python, there's never a mystery about where a name comes from:

| Written                           | Then                                      |
| --------------------------------- | ----------------------------------------- |
| `from cfop import sune`           | `sune` can be used bare                   |
| `from cfop import sexy, sune`     | several names, listed                     |
| `from cfop import sune as mySune` | `sune`, used under another name: `mySune` |
| `import cfop`                     | its names are used qualified: `cfop.sune` |
| `import cfop as c`                | the module, renamed: `c.sune`             |

- **No `from cfop import *`.** Every bare name is defined in the file or
  listed in a `from … import` line.
- **No shadowing:** a name defined in the file and also imported, or
  imported from two modules, is an error. `as` resolves a clash
  (`from other import sune as otherSune`). Renaming with `as` works in
  both forms of import, and the import line still shows where each name
  comes from; the name before `as` can't be used.
- **Only what a module defines can be imported from it,** not what it
  imported itself: `sune` always comes from `cfop`, however it reached the
  module that uses it.
- Imports come first in a file. A module is found next to the importing
  file. Circular imports are an error.
- A qualified name is used like any other: `cfop.sune'`, `F<cfop.sexy>`.
- **An unused import is a warning:** each name in a `from … import` line
  that the file never uses, and an `import cfop` with no `cfop.…` in the
  file. The warning names the import, so it can be removed.

### Generalization

Keep a puzzle-independent core (permutations, patterns, control) and put
everything puzzle-specific in a puzzle definition: face letters, place
names, moves, whole-puzzle turns, face-picture reading order, color scheme,
`legal`. The parser must not hard-code `udfblr`
or the move list.

## Open questions

1. _(Resolved: the language is Rubikon, files are `.rbk`.)_
2. **Composition in two directions.** `p q` is left to right, `p(q)` inside
   out. Both are useful, but mixed carelessly they read in opposite
   directions (`R(U)F(U)` is `U R U F`, not `U F U R`). Options: keep both
   (current), restrict application to names (`R(U)` an error), drop `p(q)`
   for permutations and keep function syntax for functions only (a
   reviewer's recommendation), or add a forward keyword (`p then q`).
3. _(Resolved: a commutator is a function, `commutator(a, b)` in cubers'
   order; a conjugate is written `w<p>`.)_
4. _(Resolved: `'` inverts names and groups, e.g. `t'`, `(R U)'`; a number
   after a group repeats it, `(R U)3`; there is no `^`.)_
5. _(Resolved: `search U* as t { case … }`, shortest first, turns made only where written, nothing found is an error; see Searches. Still open: alternatives with a depth limit, `(U|D){0,3}`, and `U?`, until a method needs them.)_
6. _(Resolved: `each` is kept: the block 4 times, always, turning after
   each; distinct from `search`, which stops at the first match.)_
7. **Face pictures: minimal or complete?** For matching, `_` means "don't
   care". The page's case pictures show a whole plausible cube; the page
   could fill the `_` cells in. Side tabs (a bigger picture including the side stickers) for the
   side colors of the top edges?
8. **Captions and pictures in the file:** should each case carry its "what
   to look for" text and picture, so the page's method section is generated
   from the same file as the solver?
9. **Statements vs. expressions:** keep `do` the only thing with an effect,
   and everything else pure?
10. _(Resolved: whole cube turns are virtual (they change the frame; the moves come out renamed); `show(x)` tags one turn as visible, inside any `Moves` value. See Whole cube turns.)_
11. **Twist-agnostic cycles:** `/…/r` covers single places; Place D Corners
    needs "these corners cycle, ignoring twists". `positions(cube) has
(ufl ulb ubr)`, or a flag on the cycle?
12. _(Resolved: `uf is not /u_/` is allowed. Still open: a way to write "either f or r" in a cell, and which face a picture without `face U` would mean.)_
13. _(Resolved: `y* U*` searches two generators, every U turn within
    every y turn.)_
14. _(Resolved: the JSON is designed along with the compiler.)_
15. _(Resolved: `x y z` are a change of frame, not a permutation; a cube state never contains one. See Whole cube turns.)_
16. **Other puzzles** (deferred): "solved however held" is already the right
    definition for the 2×2 and 4×4 (no fixed centers), but they still need a
    reference for naming places; indexes for places that share faces
    (`uf.1`, `uf.2`); pieces that look alike (patterns on colors work;
    tests on which physical piece is where don't); layer moves (`2R`,
    `3Rw`); the pyraminx's lower case tip moves clash with lower case place
    names; face pictures for triangles; a sticker-numbered engine (as GAP
    does) under the names.
17. **Modules:** Is there a standard library, found without being next to
    the importing file? (`cfop` is the obvious first member.) Should a
    module or algo declare its puzzle (the old `solution basic for cube3`)?
    Should provenance be data (a
    `source "…"` clause the page can show) rather than a comment? And `.`
    now marks a module's names, so question 16's `uf.1` for places would
    need another mark.

## Problems with the current design

- **P hides what it undoes** in the TypeScript tables today:
  `rule("F2 P F2")` means nothing without the generator two lines up. The
  language fixes it (`do t F2 t' F2`); the tables were left as they are.
- **Two composition orders** (open question 2).
- **Case order** matters for plain boolean tests (the line pattern also
  matches the cross); negative cells in pictures fix it, but tests written
  with `and` still depend on order.
- **Names change** with whole cube turns and slices. Intended, but
  surprising; to follow one physical piece, take `cubie(x)` first.
- **Patterns read in the place's letter order,** so some tests read
  backwards at first: `rfu is /u__/` means "yellow faces right" (reading
  the urf corner from its r sticker).
- **`<` and `>` are taken by conjugates,** so comparisons of numbers
  (`order(p) < 6`), if ever needed, will need words (`less than`) rather
  than symbols.
- **The 2003 quirks** the TypeScript solvers keep for move-for-move
  compatibility (half turns always clockwise, `U2 U` written out, quarter
  turns recorded in the 2003 directions) don't belong in the language.

## Discarded

| Idea                                                                                               | Why                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conjugate(a, b)` as a function                                                                    | Which argument is the wrapper has to be remembered, and nesting gets hard to read; `F<R U>` shows it                                                              |
| An infix conjugate (`p^w`, `p @ w`, `p ~ w`)                                                       | Without brackets, it's unclear how much of `R U ~ F` is wrapped; `^` reads as a power                                                                             |
| `from cfop import *`                                                                               | A bare name could come from anywhere; names are listed, or written qualified (`cfop.sune`)                                                                        |
| Well-known sequences built in (always defined)                                                     | Where a name comes from would be a mystery; they're a module, imported by name                                                                                    |
| `solution basic for cube3 { … }` and `stage "…" goal … { … }`                                      | One construct for both: `algo [name] ["Description"] [goal …] { … }`, nested for stages                                                                           |
| `slot(x)` and `match slot(x) { case df -> … }`                                                     | Asking which place holds a piece is a pattern test, `df is /df/r`; `match` takes only conditions                                                                  |
| `fn name(p) = …`                                                                                   | A body on several lines reads badly after `=`, so a function's body is a block; and the keyword is `fun`, because this is supposed to be fun: `fun name(p) { … }` |
| Functions without types (`fun lift(p) { … }`)                                                      | Every parameter and result is typed, so the compiler can check each call                                                                                          |
| `fun f(p: T) -> T`                                                                                 | `->` is the case arrow; a result type is written like a parameter's, `fun f(p: T): T`                                                                             |
| Functions whose value is their last expression, cases that produce values (`case fr is p -> R<U>`) | `match` would mean two things; actions are algos (`-> do …`), and a `fun` says `return`                                                                           |
| `Sequence` as a type name                                                                          | A sequence of what? `Moves` says it                                                                                                                               |
| `show z2` as a statement                                                                           | A visible turn couldn't be part of a `Moves` value; `show(x)` tags one turn, and `do` plays it                                                                    |
| `Rotation` as the type of `x y z`                                                                  | They reorient the cube; `Orient` says so, and "rotation" is already a pattern's `r`                                                                               |
| A file's top-level algo running when the file runs, or a top-level `do`                            | Implicit, and a top-level `do` would run on import; `algo main` names the entry point, and `do basic.main` runs it                                                |
| The 2003 notation (`ruRU`: lower case clockwise; `i j k` rotations)                                | Replaced everywhere by standard notation                                                                                                                          |
| Upper case piece names (`URF`)                                                                     | Reads as moves U R F; Singmaster used lower case                                                                                                                  |
| Corner names in either winding (`ufr` as well as `urf`)                                            | Six spellings per corner; clockwise only gives exactly three, one per sticker                                                                                     |
| Bare names as cubies, `@urf` for locations                                                         | Permutations move places, so places get the plain names; a cubie is a complete pattern, `/urf/`                                                                   |
| `home(c)` (or `target(c)`, `c.home`)                                                               | Not needed: a complete pattern's letters are its home                                                                                                             |
| `&c` / `*loc` (address and dereference)                                                            | `*&df == df` would be true only when df is home, unlike a pointer; `cubie(x)` and `location(p)` say it plainly                                                    |
| `loc.cubie`, `c.home` (properties)                                                                 | Plain functions instead; no new syntax                                                                                                                            |
| `=~` for matching                                                                                  | Looks like "not equal"; `is` reads as English                                                                                                                     |
| `==` comparing a place with a piece                                                                | `==` would mean two things; `is` looks inside a place, `==` never does                                                                                            |
| Bare patterns (`u_`, `u__`)                                                                        | Hard to tell from names; `/…/` marks them                                                                                                                         |
| `~=` (same piece, any twist)                                                                       | Now the `r` flag: `ubr is /ulb/r`                                                                                                                                 |
| Face pictures in braces with spaced cells (`face U { _ u _ / … }`)                                 | Brackets with `/` between rows read as a two-dimensional pattern: `face U [_u_/uuu/_u_]`                                                                          |
| Lists of places in brackets (`[uf ur ub ul] is [...]`)                                             | Brackets are for face pictures; functions take several places: `solved(uf ur ub ul)`                                                                              |
| "Solved" meaning the identity (`c m == ()`)                                                        | Any way of holding a solved cube counts                                                                                                                           |
| Cubies named by color (`$ybo`), `#` as their mark                                                  | `#` is for comments; names relative to the centers make rules work on every side                                                                                  |
| Permanent names (a letter always means one color)                                                  | The meaning of `u` would split after `x`; rules must follow the cube as held                                                                                      |
| `where(c)`                                                                                         | Sounds like a loop; now `location(p)`                                                                                                                             |
| `solvable(p)`                                                                                      | Sounds like it returns moves; now `legal(p)` (a yes/no check)                                                                                                     |
| `sticker(x)`                                                                                       | Replaced by patterns: `uf is /u_/`                                                                                                                                |
| `skip if <cond>`                                                                                   | An algo's goal: an algo whose goal already holds is skipped                                                                                                       |
| `around y`                                                                                         | Renamed `each y` (open)                                                                                                                                           |
| `search U { … }`, `using U match`, `using y, U match`, `find /uf/ by U as t { at uf -> … }`        | One construct: `search U* as t { case uf is /uf/ -> … }`                                                                                                          |
| Search turns made implicitly (before a case's moves)                                               | Explicit is better: `do t F2`                                                                                                                                     |
| `turns` / `turns'` (an unnamed search)                                                             | Every search names its turns: `as t`                                                                                                                              |
| Searching in turn order (`E*` ≠ `E'*`)                                                             | Shortest first, so the direction doesn't matter                                                                                                                   |
| Whole cube turns as moves in the solution                                                          | They change the frame; `show` for a visible turn                                                                                                                  |
| `*` for composition                                                                                | Suggests order doesn't matter; side by side is used (`*` appears only as a suffix on a search generator, `U*`)                                                    |
| Sequences in brackets with commas `[R, U, F]`                                                      | Reads as the commutator `[R, U]`, and arrays with commas imply a different order convention                                                                       |
| Commutator brackets `[A, B]`, `[A: B]`; GAP's `Comm(a, b)`, `a^b`                                  | Brackets are face pictures, and GAP's definitions run the other way from cubers'; named functions say which is meant                                              |
| Powers: `p^3`, `p^-1` (and `p3`, `(…)x3`, `p*3`)                                                   | `(p)3`, as cubers write it, and `'` for the inverse                                                                                                               |
| GAP's `i^p` for "where i goes"                                                                     | Function notation `p(uf)` chosen                                                                                                                                  |
| `<Identity>`                                                                                       | `()`                                                                                                                                                              |
| Moves without spaces (`RUR'U'`)                                                                    | Spaces everywhere, one rule                                                                                                                                       |
| A `Notation` string type in the code                                                               | Sequences are `Move[]`; text only at the edges; `alg("…")` checked at compile time                                                                                |

## How the current solvers would be written

The drafts are in their own files, so they can be read (and later run) as
code:

- [`rubikon/basic.rbk`](rubikon/basic.rbk) — the Basic Modern Solution,
  complete.
- [`rubikon/singmaster.rbk`](rubikon/singmaster.rbk) — Singmaster, a
  sketch.
- [`rubikon/cfop.rbk`](rubikon/cfop.rbk) — well-known sequences, for
  solutions to import; Basic imports `sexy` and `sune` from it.

Notes:

- Both solutions name their sequences and write them as commutators,
  conjugates, inverses, and mirrors (`swapRight = B'<U'<(R2 U2)3>>`,
  `insertLeft = reflect(insertRight, M)`), with the permutation each makes
  in a comment under it. Every identity and every cycle was checked on the
  TypeScript cube. A compiler could check those comments, or they could
  become assertions.
- Basic's Twist Corners is simpler than the TypeScript: a pattern on colors
  (`rfu is /u__/`) instead of finding which corner is at the front right.
- Basic's first-face case places could be derived from the sequences
  (`inverse(F2)(df)` is `uf`) and checked by the compiler.
- `cube has (…)` in Singmaster reads the cube's permutation: `cube has
(uf ur ub)` means the piece from uf is now at ur. The case then does a
  sequence making the inverse cycle, `(uf ub ur)`, which the comments make
  easy to check. (The TypeScript's corner paths read the other way, from
  each place to its piece's home; the draft had copied them, so its corner
  3-cycle cases were backwards. They are fixed.) Still open: how several
  cycles combine.
- Singmaster's Orient D Edges pictures are read from the current code; the
  exact pictures need checking against the 2003 table.
- **The language versions won't make the 2003 moves exactly:** shortest-
  first searches and virtual whole cube turns change the recorded moves.
  They'll get their own golden test; the 2003 reference test stays with
  the TypeScript solvers.

## Implementation plan (when the design settles)

1. The Peggy grammar and a parser producing an AST, with tests of every
   construct above.
2. A compiler from the AST to JSON: names resolved, sequences parsed to
   moves, patterns compiled to tests.
3. A runtime in the simulator that executes the JSON.
4. `basic.rbk` and `singmaster.rbk`, replacing `beginner.ts` and
   `singmaster.ts`, checked by their own golden test and the 2003 test
   staying with the TypeScript until then.
5. Generate the page's method section (captions, pictures) from the file,
   if open question 8 says so.
