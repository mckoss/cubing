# Rubikon Language Specification

Rubikon is a small language for writing down how a person solves the
Rubik's Cube: the stages of a method, the patterns to look for at each
stage, and the move sequences to apply. A Rubikon file is parsed to a
JSON syntax tree ([rubikon-json.md](rubikon-json.md)), and the simulator
runs it.

This document specifies the settled design only. The design notes, open
questions, and discarded ideas are in [LANGUAGE.md](LANGUAGE.md). The
grammar is [`src/lib/rubikon/rubikon.peggy`](src/lib/rubikon/rubikon.peggy);
where this document and the grammar seem to differ, the grammar says what
parses.

## 1. Introduction

A Rubikon file has the extension `.rbk`. It is a **module**: a list of
imports, then definitions (`let`, `fun`, and `algo`). A file with an algo
named `main` is a **method**: running the file runs `main`. A file
without one is a **library** of definitions for other files to import.

Every method must pass one test: after the scramble and the method's
moves, the cube is solved, however it's held.

A short, complete method:

```
# Lift a piece to the top without disturbing the rest of the bottom.
algo lift(p: Pattern) "Lift a piece to the top" {
  match {
    case df is p -> do F2      case dr is p -> do R2
    case db is p -> do B2      case dl is p -> do L2
    case fr is p -> do R<U>    case br is p -> do R'<U>
    case bl is p -> do L<U>    case fl is p -> do L'<U>
    otherwise    -> ()         # already in the top layer
  }
}

algo main "The bottom cross" goal solved(df dr db dl) {
  let insert = F2                     # an edge from uf, down to df

  each y {                            # each bottom edge in turn
    if not solved(df) {
      do lift(/df/r)                  # bring it to the top, either way round
      search U* as t {                # turn the top until it's above df
        case uf is /df/ -> do t insert        # bottom color up
        case fu is /df/ -> do t U' R'<F>      # bottom color in front
      }
    }
  }
}
```

The ideas behind it:

- **Names are places.** `uf`, `fu`, `urf`, and `u` are locations on the
  cube, including which way the piece in them faces.
- **Patterns describe what's in a place:** `/u_/`, `/!u!u/`, `/df/`.
- **`is` tests a place against a pattern:** `uf is /df/` means the
  down-front piece is at uf, with its d sticker on the u side.
- **Everything is relative to the cube as it's held** (its centers). After
  a `y`, `fr` means the place now at the front right.
- **Only `do` changes the cube.** Everything else computes or tests.

The complete examples are [`rubikon/basic.rbk`](rubikon/basic.rbk) (the
Basic Modern Solution), [`rubikon/singmaster.rbk`](rubikon/singmaster.rbk)
(David Singmaster's 1981 solution, a sketch), and
[`rubikon/cfop.rbk`](rubikon/cfop.rbk) (a library of well-known
sequences).

## 2. Lexical structure

### Comments and whitespace

`#` starts a comment that runs to the end of the line.

Spaces, tabs, and newlines are insignificant. There are no statement
separators: every statement and every case begins with a keyword, and no
keyword can begin a move, a name, or a place. So a move sequence ends
where the next keyword begins, and it can run over several lines:

```
case df is p -> do F2   case fr is p -> do R<U>     # two cases on one line
```

Items in a sequence are written with spaces between them: `R U R' U'`,
never `RUR'U'`. After a move a space is required (`R'U` and `R2U` are
errors); after `'`, `)`, or `>` the grammar doesn't insist
(`sune'sexy` parses as `sune' sexy`), but write one. A few places must
have **no** space:

| No space                            | Example           | With a space                   |
| ----------------------------------- | ----------------- | ------------------------------ |
| before a repeat count               | `(R U)3`          | `(R U) 3` is an error          |
| before the `<` of a conjugate       | `R<U>`            | `R <U>` is an error            |
| between a function name and `(`     | `commutator(R,U)` | `sexy (R)` is `sexy` then `R`  |
| between an algo's name and `(`      | `algo lift(p: …)` | `algo lift (p: …)` is an error |
| before a search generator's `*`     | `U*`              |                                |
| before a cycle's `+` or `-`         | `(urf)+`          |                                |
| between a type and its argument `(` | `Set(Location)`   |                                |
| inside a pattern                    | `/u__/`           | `/u _ _/` is an error          |

### Words

Words are made of letters, digits, and `_`. What a word means depends on
its first letter and its spelling:

| Word                                           | Is                                        |
| ---------------------------------------------- | ----------------------------------------- |
| `U D L R F B`, `Uw`…`Bw`, `M E S`, `x y z`     | a move, optionally followed by `'` or `2` |
| lower case face letters only: `uf`, `urf`, `u` | a location (a place)                      |
| one of the keywords below                      | a keyword                                 |
| other words starting with a lower case letter  | a name                                    |
| a capital, then more letters (in a type)       | a type: `Pattern`, `Set`                  |

**Keywords** (reserved; not usable as names):

```
algo  goal  let  fun  return  do  each  match  search  as  case
otherwise  else  until  max  if  not  and  or  in  is  all  has  face
import  from
```

`in` and `all` are reserved for future use; nothing uses them yet.

**Names** start with a lower case letter and continue with letters,
digits, and `_`: `sexy`, `insertRight`, `cycleCorners2`. A name can't be:

- a keyword;
- `x`, `y`, or `z` (they are moves);
- made only of face letters `u d f b l r` (`fur`, `bud`, `f`, `d`): it
  would read as a place. So a function can't be called `f`.

A name that looks like a move, such as `x2`, is accepted by `let`, but
reads as the move wherever it's used; don't write one.

**Types** are capitalized words, written only where a type is expected:
after `:` in a `let`, a parameter, or a function's result (see
[Types](#4-types)).

### Moves

A move is a face, wide, slice, or whole cube turn in standard (WCA)
notation, then an optional `'` (counterclockwise) or `2` (half turn):

| Letters       | Turn                                                   |
| ------------- | ------------------------------------------------------ |
| `U D L R F B` | a face                                                 |
| `Uw` … `Bw`   | a face and the slice next to it (wide)                 |
| `M E S`       | a middle slice (M follows L, E follows D, S follows F) |
| `x y z`       | the whole cube (x follows R, y U, z F)                 |

`R'` and `R2` are single moves. Wide turns are always `Rw`, never lower
case (lower case letters are places). A move must be followed by a space
or a character that can't be part of a word: `R'U` and `R2U` are errors.

### Places, patterns, and face pictures

A location is a word of lower case face letters (`u`, `uf`, `urf`), checked
against the 54 real ones. A pattern is cells between slashes, with no
spaces (`/u__/`, `/!u!u/`), and an optional `r` straight after it (`/df/r`).
A face picture is `face`, a face letter, and three rows of three cells in
brackets (`face U [_u_ / uuu / _u_]`).

A pattern cell is one of `u d f b l r` (that color), `_` (any sticker), or
`!` and a face letter (any sticker but that color). A counterclockwise
corner name is an error that names the clockwise spelling:
`Not a location: ufr (corners are named clockwise: urf)`.

### Strings and numbers

A **string** is text in double quotes, on one line, with no escapes:
`"Lift a piece to the top"`. Strings are used only for an algo's
description.

A **number** is a run of digits. Numbers appear in only two places: a
repeat count straight after `)` (`(R U)3`), and the bound of an `until`
(`max 4`). There are no number values in expressions.

### Every special character

| Token   | Uses                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `#`     | comment to the end of the line                                                                                          |
| `'`     | part of a move (`R'`); after anything else, its inverse: `t'`, `(R U)'`                                                 |
| `2`     | part of a move (`U2`)                                                                                                   |
| digits  | after `)`, a repeat count: `(R U R' U')3`; after `max`, a bound                                                         |
| `( )`   | grouping `(R U)'`; a cycle `(uf ur ub)`; the identity `()`; arguments and parameters `order(p)`; nothing to do, `-> ()` |
| `< >`   | a conjugate: `F<R U>` is `F R U F'`                                                                                     |
| `+` `-` | after a cycle: its pieces come back turned, `(urf)+`                                                                    |
| `/ /`   | a pattern, `/u__/`; `r` after it: any rotation, `/ulb/r`                                                                |
| `/`     | between the rows of a face picture                                                                                      |
| `_`     | in a pattern or picture: any sticker                                                                                    |
| `!`     | in a pattern or picture: any sticker but, `!u`                                                                          |
| `*`     | after a search generator: zero or more of that turn, `U*`                                                               |
| `[ ]`   | a face picture                                                                                                          |
| `{ }`   | a block                                                                                                                 |
| `->`    | between a case and its action                                                                                           |
| `=`     | `let` binding                                                                                                           |
| `==`    | equality                                                                                                                |
| `,`     | between arguments, parameters, and imported names                                                                       |
| `.`     | a name from a module: `cfop.sune`                                                                                       |
| `:`     | a type: `p: Pattern`, a function's result `fun f(…): Int`                                                               |
| `" "`   | a string                                                                                                                |

## 3. Places and pieces

### Locations

A **location** (Singmaster's _cubicle_) is a place on the cube **and
which way the piece in it faces**. It is written with the letters of the
faces it touches. The first letter says which of the piece's stickers is
read first: `uf` and `fu` are the same place, read from different
stickers.

- 6 **centers**: `u d f b l r`.
- 12 **edges**, each with 2 spellings (24 locations): `uf ur ub ul`,
  `df dr db dl`, `fr fl br bl`, and their reverses (`fu`, `ru`, …).
- 8 **corners**, each with 3 spellings (24 locations): `urf ufl ulb ubr`
  and `dfr dlf dbl drb`, with their rotations (`urf`, `rfu`, `fur`).

That is 54 locations, one per sticker.

**Corners are named clockwise:** the corner's faces are read clockwise as
seen from outside the cube. `ufr` (counterclockwise) is not a name, and
neither are `fru` or `ruf`. So each corner has exactly three names, one
starting from each of its stickers.

**All names are relative to the cube as it's held now**, that is, to its
centers. Face turns never rename anything. Whole cube turns (`x y z`),
slices (`M E S`), and wide turns move the centers, so they rename every
place consistently: after `y`, `fr` is the place now at the front right.
This is what lets `each y { … }` write a rule once for all four sides.

### Relative colors

A color is named by the face it belongs on: `u` is the color of the
center now on top. There are no color names in rules. (A color scheme is
only for display; it is not part of a Rubikon file.)

### Patterns

A **pattern** describes the stickers of one piece, one cell per sticker,
read in the letter order of the place it's tested against:

| Cell | Matches             |
| ---- | ------------------- |
| `u`  | the color of u      |
| `_`  | any sticker         |
| `!u` | any sticker but u's |

```
uf is /u_/        # the top color faces up at uf
urf is /_u_/      # reading urf as u, r, f: the r sticker is the top color
rfu is /u__/      # the same test, read from rfu
uf is not /u_/    # the top color doesn't face up at uf
```

A pattern has as many cells as the place has stickers: 1 for a center, 2
for an edge, 3 for a corner. **A place and a pattern for a different
kind of piece never match.** When both kinds are known, it's a compile
error (`df is /dfr/`: an edge place against a corner pattern); when one
isn't (a `Pattern` parameter), the test is simply false.

**`r` means any rotation:** `/df/r` matches the df piece either way
round, and `/ulb/r` the ulb corner in any of its three twists. `/u__/r`
matches any corner with a top-color sticker. Patterns like `/!u!u/`
already match every rotation.

### Cubies

**A pattern with no wildcards and no `r` is a cubie:** one piece, with an
orientation. `/df/` is the down-front edge, read with its d sticker
first. `/df/` and `/fd/` are the same piece oriented two ways, just as
`uf` and `fu` are the same place.

```
uf is /df/     # the df piece is at uf, with its d sticker up
fu is /df/     # the same piece at the same place, flipped
df is /df/     # home, the right way round: solved(df)
```

`/df/r` leaves the orientation open, so it is a pattern, not a cubie; so
is `/u__/r`, which could be several pieces.

A cubie written as a pattern is read relative to the centers, like any
pattern: after `y`, `/fr/` is the piece that now belongs at the front
right. A cubie from `cubie(x)` is different: it is the physical piece in
place x now, oriented as x reads it, and it **follows that piece** through
whole cube turns. It prints as the pattern that names it now.

### Face pictures

A **face picture** is a pattern for a whole face, as seen looking at it:
`face`, a face letter (upper case), and three rows of three cells in
brackets, separated by `/`. Each cell is `u`, `_`, or `!u` (any face
letter). Spaces between cells are optional.

For U, the rows are read from the back: `ulb ub ubr`, then `ul u ur`,
then `ufl uf urf`:

```
face U [_!u_ / uuu / _!u_]             # the line, left to right
face U [ _ !u _ /  u u u  / _ !u _ ]   # the same, spaced out
face U [_u_ / uuu / _u_]               # the cross
```

Negative cells make cases exclusive, so their order doesn't matter: the
line above can't match the cross.

## 4. Types

Types are written with a capital letter.

| Type             | Values                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `Location`       | a place, with facing: `uf`, `fu`, `urf`, `u`                                                  |
| `EdgeLocation`   | `uf`, `fu`, …                                                                                 |
| `CornerLocation` | `urf`, `rfu`, `fur`, …                                                                        |
| `CenterLocation` | `u`, …                                                                                        |
| `Pattern`        | anything between slashes: `/d_/`, `/u__/`, `/df/r`                                            |
| `Cubie`          | one piece with an orientation: `/df/`, `/fd/`, or from `cubie(x)`                             |
| `Edge`           | `/df/`, `/fd/`                                                                                |
| `Corner`         | `/urf/`, `/rfu/`                                                                              |
| `Center`         | `/u/`                                                                                         |
| `Permutation`    | cycles, `(uf ur ub)`, `()`; a cube state (`cube`)                                             |
| `Moves`          | a sequence of moves, `R U R' U'`: a permutation that remembers its moves, so it can be played |
| `Face`           | `U D F B L R`, as in `layer(D)`                                                               |
| `Slice`          | `M E S`, as in `reflect(p, M)`                                                                |
| `Orient`         | one whole cube turn: `x`, `y'`, `z2`, as in `show(x)`                                         |
| `Set(Location)`  | several places: `layer(D)`                                                                    |
| `Int`            | a whole number: `order(p)`                                                                    |
| `Bool`           | true or false: `legal(p)`, `solved(df)`                                                       |

### The kind hierarchy

A value of a type can be used wherever its parent is expected:

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

Permutation      (uf ur ub)  ()  cube
└── Moves        R U R' U'
```

Any `Moves` value can be used as a `Permutation`, but not the reverse: a
cycle can be tested and compared, but not played.

Where a `Face`, `Slice`, or `Orient` is expected, a move names it:
`layer(D)` means the D face, not a D turn; `reflect(p, M)` the M slice;
`show(y')` the whole cube turn y'.

### Signatures

**Every function states its types:** each parameter and the result. An
algo with parameters states each parameter's type. The compiler checks
every call and every use of a result.

```
fun lastSlot(p: Pattern): Location { … }
algo lift(p: Pattern) "Lift a piece to the top" { … }
```

A `let` may state its type, or take the type of its value:

```
let t: Moves = R U R' U'
let sexy = commutator(R, U)            # Moves
```

A search's `as t` is of type `Moves`.

## 5. Move expressions

An expression is one or more **terms**, side by side. Moves side by side
are played in order, left to right.

| Expression            | Meaning                                                 |
| --------------------- | ------------------------------------------------------- |
| `R U R' U'`           | a sequence: R, then U, then R', then U'                 |
| `p q`                 | p, then q (for any Moves or Permutations)               |
| `()`                  | the identity: nothing                                   |
| `p'`                  | the inverse of p: `t'`, `(R U)'` is `U' R'`             |
| `(p)3`                | p three times: `(R U R' U')3`, `(sexy)2`                |
| `w<p>`                | the conjugate `w p w'`: p, set up with w, then put back |
| `name`, `module.name` | a defined value: `sune`, `cfop.sune`                    |
| `f(a, b)`             | a function call: `commutator(R, U)`                     |
| `p(x)`                | a named permutation applied to a place: `sexy(uf)`      |

### Inverse

`'` after a move is part of the move (`R'`). After anything else (a name,
a group, a call, a conjugate), `'` inverts it: `sune'`, `(R U)'`,
`F<R U>'`, `commutator(R, U)'`. `(R U)3'` is the inverse of three repeats.

### Repeat

A number straight after a closing parenthesis repeats the group, as `2`
does for a single move. A name alone can't take a number (`sexy3` is a
different name), so write `(sexy)3`. There is no space before the
number, and no other power notation.

### Conjugate

`w<p>` is `w p w'`, read "p, set up with w". It reads in the order the
moves happen, and the brackets show what is wrapped.

- **The wrapper is one term:** a move, a name, a call, or a group, with
  any `'` or repeat: `U'<R>`, `t<F>`, `y<insertLeft>`, `(R' B2)<(commutator(F, R))3>`.
  `U R<L'>` is `U`, then `R<L'>`.
- **The whole conjugate is one term:** `F<R U>'` is `F U' R' F'`, and
  `(F<R U>)2` repeats all of it. A conjugate can't take a repeat count
  directly: write `(F<R U>)2`, not `F<R U>2`.
- **Conjugates nest:** `t<F<D>>` is `t F D F' t'`;
  `B'<U'<(R2 U2)3>>` is `B' U' (R2 U2)3 U B`.

### Commutator and reflection

These are functions (see [Built-in functions](#11-built-in-functions)):

```
let sexy        = commutator(R, U)                       # R U R' U'
let insertRight = commutator(U, R) commutator(U', F')
let insertLeft  = reflect(insertRight, M)                # its mirror image
let twistCorner = (commutator(D', R'))2
```

`commutator(a, b)` is `a b a' b'`, cubers' order. Swapping its arguments
gives the inverse: `commutator(b, a)` is `commutator(a, b)'`.

`reflect(p, M)` is p seen in a mirror through the plane of the M slice
(between L and R): the faces on either side swap, and every turn goes the
other way, because a mirror reverses clockwise. `R` becomes `L'`, and `U`
becomes `U'`, so `reflect(U R U', M)` is `U' L' U`. `E` mirrors U and D,
and `S` mirrors F and B. For a permutation written as cycles, each place
is mirrored and corner names are respelled clockwise (the mirror of `urf`
reads `ufl`), which also swaps each corner cycle's `+` and `-`.

Where the mirror of a job is the same job done backwards, use the
inverse instead: the counterclockwise twist is `twistCorner'`.

### Application

`p(x)`, where p is a name bound to a permutation, is where the piece at
place x ends up. `p(q)`, with q a permutation, is q then p (inside out,
like functions). Only a name can be applied: `R(U)` is not an
application, but the sequence `R U`.

### Whole cube turns

**`x`, `y`, and `z` change the frame, not the cube.** They make no moves
in the solution: the moves after them come out renamed. So

```
do y insertLeft y'
```

is output as `insertLeft` with its letters renamed, `U' F' U F U R U' R'`,
with no `y`. Playback stays steady: the cube never spins between steps.
A cube state never contains a whole cube turn.

**`show(t)` tags one turn as visible.** It takes one whole cube turn
(`x`, `y'`, `z2`) and gives it as a visible turn. The tag stays with the
turn, so it can be built into a sequence:

```
let aPerm = show(x) R' U R' D2 R U' R' D2 R2 show(x')
do show(z2)                                # "turn the cube over"
```

When `do` plays a tagged turn, the cube visibly turns, and the moves
after it keep their names. Use it when a method tells a person to turn
the cube, or when a published sequence turns it and a person would too.
Visible turns should be rare. `show(R)` and `show(x y)` are type errors:
face turns are always visible, and each shown turn is tagged by itself.

### Items side by side

Side by side means "in order" for moves, and "a list" for places:
`solved(df dr db dl)` passes one argument, a list of four places. The
parser makes the same sequence node for both; the evaluator reads it by
type.

## 6. Permutations and cycle notation

A move, a sequence of moves, and a cube state are all permutations. A
cube state is the permutation that takes a solved cube to it. The name
**`cube`** is the current cube state, relative to the frame.

### Cycles

A permutation is written as cycles of locations. The same notation is
printed and read, so what the page shows can be pasted back.

```
(uf ur ub)            # the piece at uf goes to ur, ur's to ub, ub's to uf
(uf ub)               # swap two edges
(uf bu)               # swap them, and flip both
(urf)+                # twist a corner clockwise in place
(ur ub fu) (urf ufl)+ (ubr ulb)-
()                    # the identity
```

- **Letter order is orientation.** In `(a b c)`, the piece at a moves to
  b with the sticker read first at a now read first at b.
- **A suffix means the pieces come back turned:** `+` once (a corner
  clockwise, an edge flipped), `-` twice (a corner counterclockwise).
  Only the return from the last place to the first carries the turn.
- A cycle of one place needs a suffix to do anything: `(urf)+`.
- Cycles side by side are composed: `(uf ur) (ub ul)`.
- A cycle can't take a repeat count directly.

### Order

The order of a permutation is the least common multiple of its cycles'
orders. A cycle of _n_ pieces has order _n_; with a suffix, 3*n* for
corners and 2*n* for edges. `R U` is
`(uf ul ub ur br dr fr) (urf)+ (ufl ulb ubr bdr dfr)-`, of order
lcm(7, 3, 15) = 105.

### The printed form

The same permutation always prints the same way. A cycle can be written
starting from any of its pieces, and with every name rotated alike, so
the printer chooses:

1. **Which cycles, in what order.** Pieces are taken in this fixed order:
   U edges `uf ur ub ul`, U corners `urf ufl ulb ubr`, D edges
   `df dr db dl`, D corners `dfr dlf dbl drb`, middle edges
   `fr fl br bl`, centers `u d f b l r`. Each piece that moves starts a
   cycle unless it is already in one. So cycles are listed in the order
   of the earliest piece each contains.
2. **How each cycle is spelled.** Every starting piece and every
   rotation of the names (all rotated alike) is a candidate spelling.
   Each name scores 2 if it starts with `u` or `d`, 1 if it is an edge
   starting with `f` or `b`, and 0 otherwise. Choose the candidate with
   the highest total; break ties by the first name's score, then by
   starting from the earliest piece in the order above. When a spelling
   starts partway round the cycle, the names passed over come back
   rotated by the cycle's suffix.
3. **The suffix**, `+` or `-`, says how far the first piece comes back
   rotated; none if it comes back as it was.
4. **The identity** prints as `()`. Cycles are separated by one space.

So `insertRight` prints `(ur lu fu fr ub) (ulb ubr flu)`. The edge
cycle comes first (it holds uf); spelled from `ur` it scores
2 + 0 + 1 + 1 + 2 = 6, more than any other spelling.

## 7. Conditions

A **condition** is true or false. Conditions appear after `case`, `if`,
`until`, and `goal`.

| Condition                  | True when                                                    |
| -------------------------- | ------------------------------------------------------------ |
| `uf is /df/`               | the piece at the place matches the pattern (or is the cubie) |
| `uf is not /u_/`           | it doesn't                                                   |
| `p == q`                   | the two values are equal                                     |
| `cube has (uf ur ub)`      | the permutation contains the cycle                           |
| `face U [_u_ / uuu / _u_]` | the face matches the picture                                 |
| `solved(df)`, `legal(p)`   | a `Bool` value is true                                       |
| `a and b`, `a or b`        | both; either                                                 |
| `not a`                    | a is false                                                   |
| `(a)`                      | grouping                                                     |

### `is`

`place is pattern` looks inside the place: it tests the piece there.
Both sides are single terms, so the pattern can be a literal, a name, or
a call: `df is p`, `uf is location(c)`.

- Against a pattern with wildcards, it tests colors.
- Against a cubie, it tests that exact piece in that orientation:
  `uf is /df/`.
- A place and a pattern of different kinds never match (see
  [Patterns](#patterns)).

### `==`

`==` compares two values and never looks inside a place:

- `uf == fu` is false: the same place, a different facing.
- `/df/ == /fd/` is false: the same piece, a different orientation.
- `p == q` on permutations or moves compares their effect, not their
  spelling: `R2 == R R` and `sune' == antisune` are true.
- A place is never compared with a piece with `==`; use `is`.

### `has`

`perm has (a b c)` is true when the permutation moves the piece at a to
b, and the piece at b to c: `cube has (uf ur ub)` means the piece from uf
is now at ur, and so on. It takes literal cycles only. It reads the
cube's permutation, so a case that finds `(uf ur ub)` usually does a
sequence that makes the inverse cycle, `(uf ub ur)`.

### Precedence

Loosest first: `or`, `and`, `not`. Parentheses group.

```
a and b or c          # (a and b) or c
not a and b           # (not a) and b
not (a and b)
```

`not` applies to a whole condition; `is not` is its form inside `is`.
Conditions are not expressions: they can't be bound with `let` or
returned from a `fun`.

## 8. Statements

A **block** is statements in braces, `{ … }`. Statements and cases
start with keywords, so they need no separators.

### `let`

`let name = value` binds a name once (single assignment). It may state a
type: `let t: Moves = R U`. A `let` in an algo's body can be used in the
rest of that body, including in the algos nested inside it.

### `fun` and `return`

```
fun name(p1: T1, p2: T2): Result {
  …
  return value
}
```

A `fun` is a **pure helper**: it computes a value and never moves the
cube, so it contains no `do`. `return` gives its result. Every parameter
and the result have types.

### `do`

`do` is the **only** statement that changes the cube. It either plays a
`Moves` value or runs an algo:

```
do R U R' U'
do t F2 t' F2          # a search's turns, then undone
do show(z2)
do lift(/df/r)         # an algo with parameters
do basic.main          # another file's method
```

A `Permutation` that isn't `Moves` (a cycle) can't be played.

### `if`

```
if not solved(df) { … }
if a { … } else { … }
if a { … } else if b { … } else { … }
```

### `match`

```
match {
  case urf is /u__/ -> ()                 # nothing to do
  case urf is /_u_/ -> do twistCorner'
  case urf is /__u/ -> do twistCorner
  otherwise         -> do something
}
```

Each case is a condition, `->`, and an action. An action is a `do`
statement, or `()` for "nothing to do". Cases are tried in order; the
first that holds runs its action, and no others. `otherwise` comes last
and runs when nothing else holds. **If no case holds and there is no
`otherwise`, it is an error.** Cases never produce values.

### `search`

```
search U* as t {
  case uf is /df/ -> do t F2
  case fu is /df/ -> do t U' R' F R
}
```

A search looks for the fewest turns after which a case holds.

- **Generators.** `U*` means zero or more U turns. Its candidates are
  tried **shortest first**: none, then the quarter turns (clockwise
  before counterclockwise), then the half turn: `()`, `U`, `U'`, `U2`.
  So `U*` and `U'*` are the same search. A generator's order bounds it, so
  every search is finite and repeatable.
- **Several generators.** `y* U*` tries every U candidate within every y
  candidate.
- **Testing.** For each candidate, the cases are tested as if its turns
  had been made. The first case to hold, for the first candidate that has
  one, wins.
- **Nothing is done implicitly.** The candidate's turns are named by
  `as t` (a `Moves` value) and are made only where the action writes
  them: `do t F2`. So an undo is visible too: `do t F2 t' F2`. With whole
  cube turns (`y* U*`), `t` changes the frame as `y` does anywhere.
- **Nothing found is an error**, unless there is an `otherwise` case, or
  an `else search` to try next:

```
search D* as t {
  case df is /uf/ -> do t F2
} else search E* as t {                 # in the middle layer
  case lf is /uf/ -> do t<F>
}
```

The generator is a move followed directly by `*`; `as t` is required.

### `each`

```
each y {                        # each side in turn
  if not solved(df) { … }
}
```

`each` runs its block **four times, always**: first as it is, then after
each of three quarter turns. A fourth turn at the end brings the cube
back to where it started. With a whole cube turn (`each y`) it makes no
moves of its own; with a face turn (`each U`) it really turns between
passes. There is no `as t`: the body doesn't know which pass it's on.
Unlike `search`, it doesn't stop at a match.

### `until`

```
until goal max 4 {
  search U* as t { … }
}
```

`until cond max n { … }` runs the block repeatedly until the condition
holds, at most n times. `until goal` uses the enclosing algo's goal as
the condition.

## 9. Algos

An **algo** is a named, described part of a method, with its goal:

```
algo [name[(parameters)]] ["Description"] [goal condition] { … }
```

Every part is optional, but parameters need a name. A method is an algo,
and its stages are algos inside it:

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

### What algos are for

Algos are for **documentation and display**: they show which part of the
move sequence accomplishes what. The page groups moves by algo ("Top
Cross: 14 moves"), and its "next stage" button steps through them. The
description is what the page shows; without one, it shows the name.
Algos don't change which moves are made: without the nesting, a method
makes exactly the same moves.

### Stages and top-level algos

- **An algo inside another is a stage.** It has no parameters, and it
  runs where it is written.
- **An algo at a file's top level is a definition.** It runs only when
  called with `do`. Importing a file never runs anything.
- **Running a file runs its `main`.** `algo main` is the entry point. The
  page lists each file with a `main` as a method, by its description.
  Another file can run it as a step: `import basic` then `do basic.main`.

### Parameters

**An algo with parameters is like a macro.** It is defined at a file's
top level, never inside another algo, and can be imported like any
definition. It runs where another algo calls it with `do`, as if its body
were written there. The trace shows the call as its own step, with its
description. `lift` in the [Introduction](#1-introduction) is one, called
as `do lift(/df/r)`.

### Goals

**Every algo's goal is an invariant** for the part of the method it
covers.

1. **Checked at the end.** When the algo finishes, its goal must hold, or
   the solve stops with an error naming the algo.
2. **Bypassed when already true.** If the goal holds when the algo
   starts, its body doesn't run and it makes no moves. The trace still
   lists it, with a note ("Bottom Corners: already solved"), so every
   stage shows up. So an algo needn't test for its own goal; a case that
   can hold only when the goal already holds is dead code, and the
   compiler may warn about it.
3. **Goals persist.** Once an algo's goal is reached, it must hold at the
   end of **every** later algo, nested or not, until the whole method is
   done. The runtime checks all of them at each algo's end; a failure
   names both the algo that broke the goal and the algo that set it. An
   algo may disturb earlier work along the way (Twist Corners scrambles
   the bottom) as long as it restores it by its end.
4. **A goal states only what its algo adds.** Bottom Corners' goal is
   `solved(dfr drb dbl dlf)`, not `solved(layer(D))`: the bottom edges
   are already held by Bottom Edges' goal. A grouping algo (First Face)
   can state the whole of what its stages reach.
5. **Goals keep their frame.** A goal is checked in the orientation the
   cube had when its algo ran. The runtime accounts for later whole cube
   turns (Singmaster's `show(z2)`), so "the top layer is solved" still
   means that layer after the cube is turned over.

Each algo can be tested alone: start from random cubes where the earlier
goals hold, run it, and check its goal.

### Solved

A cube is **solved** when every place holds its own piece the right way
round, **however the cube is held**: any of the 24 whole cube turns of
the identity counts. A method doesn't need to turn the cube back at the
end. `solved(cube)` is the one goal that allows any way of holding the
cube. Centers have no visible orientation, so the model gives them none.
Slice moves move the centers relative to the other pieces; that is a real
difference, not a way of holding the cube.

## 10. Modules and imports

A file is a module, named by its file name: `cfop.rbk` is `cfop`. Its
top-level definitions (`let`, `fun`, and `algo`) can all be imported.
Imports come first in a file, before any definition.

| Written                           | Then                                      |
| --------------------------------- | ----------------------------------------- |
| `from cfop import sune`           | `sune` can be used bare                   |
| `from cfop import sexy, sune`     | several names                             |
| `from cfop import sune as mySune` | `sune`, under another name: `mySune`      |
| `import cfop`                     | its names are used qualified: `cfop.sune` |
| `import cfop as c`                | the module, renamed: `c.sune`             |

There's never a mystery about where a name comes from:

- **No `import *`.** Every bare name is defined in the file or listed in
  a `from … import` line.
- **No shadowing.** A name defined in the file and also imported, or
  imported from two modules, is an error. `as` resolves a clash:
  `from other import sune as otherSune`. After `as`, the original name
  can't be used.
- **Only what a module defines can be imported from it,** not what it
  imported itself: `sune` always comes from `cfop`.
- A qualified name is used like any other: `cfop.sune'`, `F<cfop.sexy>`,
  `do basic.main`.
- A module is found next to the importing file. **Circular imports are
  an error.**
- **An unused import is a warning:** each name in a `from … import` line
  that the file never uses, and an `import cfop` with no `cfop.…` in the
  file. The warning names the import, so it can be removed.

## 11. Built-in functions

`Location…` takes any number of places, side by side, and a
`Set(Location)` counts as its members: `solved(df dr db dl)`,
`solved(layer(D))`.

| Signature                               | Result                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `commutator(a: Moves, b: Moves): Moves` | `a b a' b'`: `commutator(R, U)` is `R U R' U'`                                         |
| `reflect(p: Moves, s: Slice): Moves`    | p in a mirror through the slice's plane: `reflect(U R U', M)` is `U' L' U`             |
| `inverse(p: Moves): Moves`              | `p'` (for a Permutation, a Permutation)                                                |
| `show(t: Orient): Moves`                | the whole cube turn t, tagged to be shown when played                                  |
| `order(p: Permutation): Int`            | the order of p                                                                         |
| `legal(p: Permutation): Bool`           | whether some sequence of moves makes p (flip parity, twist sum, permutation parity)    |
| `solved(x: Location…): Bool`            | each place holds its own piece the right way round (`x is /x/`)                        |
| `solved(c: Permutation): Bool`          | the cube is solved, however it's held: `solved(cube)`                                  |
| `placed(x: Location…): Bool`            | each place holds its own piece, however twisted (`x is /x/r`)                          |
| `layer(f: Face): Set(Location)`         | the places of a layer, home spellings: `layer(D)` is `d df dr db dl dfr drb dbl dlf`   |
| `location(p: Pattern): Location`        | where the piece matching a complete pattern is, facing so that it matches              |
| `location(c: Cubie): Location`          | where that piece is, spelled so its orientation matches: `uf is location(c)` reads `c` |
| `cubie(x: Location): Cubie`             | the physical piece in place x now (to follow it through turns)                         |

`location(/df/) is /df/` is always true. GAP's `Comm(a, b)` is `a' b' a b`
and its conjugate `a^b` is `b' a b`; Rubikon follows cubers' conventions
instead.

The predefined name `cube` is the current cube state, a `Permutation`.

## 12. Grammar summary

A compact summary of [`rubikon.peggy`](src/lib/rubikon/rubikon.peggy).
`_` is optional whitespace and comments; juxtaposed items in `Term`,
`Paren`, `Move`, `Pattern`, `Call`, and `Type` have **no** whitespace
between them. `A?` is optional, `A*` zero or more, `A+` one or more.

```ebnf
File        = _ Import* TopDef*
Import      = "from" Ident "import" ImportedName ("," ImportedName)*
            | "import" Ident ("as" Ident)?
ImportedName= Ident ("as" Ident)?
TopDef      = Let | Fun | Algo

Statement   = Let | Fun | Algo | Do | Return | If | Match | Search | Each | Until
Block       = "{" Statement* "}"
Let         = "let" Ident (":" Type)? "=" Expr
Fun         = "fun" Ident Params ":" Type Block
Algo        = "algo" Ident? Params? String? ("goal" Cond)? Block    (* Params directly after the name *)
Params      = "(" (Param ("," Param)*)? ")"
Param       = Ident ":" Type
Type        = TypeName ("(" TypeName ")")?
Do          = "do" Expr
Return      = "return" Expr
If          = "if" Cond Block ("else" (Block | If))?
Match       = "match" "{" Case* Otherwise? "}"
Case        = "case" Cond "->" Action
Otherwise   = "otherwise" "->" Action
Action      = Do | "(" ")"
Search      = "search" Generator+ "as" Ident "{" Case* Otherwise? "}" ("else" Search)?
Generator   = Move "*"
Each        = "each" Move Block
Until       = "until" ("goal" | Cond) "max" Int Block

Expr        = Term+
Term        = Atom "'"* ("<" Expr ">")? "'"*
Atom        = Paren | Call | QualifiedName | Move | Location | Name | Pattern
Paren       = "(" ")" | Cycle | "(" Expr ")" Int?
Cycle       = "(" LocationName+ ")" ("+" | "-")?
Call        = (QualifiedName | Name) "(" (Expr ("," Expr)*)? ")"
QualifiedName = Ident "." Ident
Name        = Ident
Move        = ([UDLRFB] "w"? | [MES] | [xyz]) ("2" | "'")?     (* not followed by a word character *)
Location    = LocationName
LocationName= [udfblr]+                     (* one of the 54 locations; corners clockwise *)
Pattern     = "/" Cell+ "/" "r"?
Cell        = "_" | "!" [udfblr] | [udfblr]

Cond        = AndCond ("or" AndCond)*
AndCond     = NotCond ("and" NotCond)*
NotCond     = "not" NotCond | FacePicture | "(" Cond ")" | Comparison
Comparison  = Term "is" "not"? Term
            | Term "has" Cycle+
            | Expr "==" Expr
            | Term
FacePicture = "face" [UDLRFB] "[" Row "/" Row "/" Row "]"
Row         = Cell Cell Cell                (* spaces allowed between cells *)

Ident       = [a-z] [A-Za-z0-9_]*           (* not a keyword, not x y z, not only [udfblr] *)
TypeName    = [A-Z] [A-Za-z]+
String      = '"' [^"\n]* '"'
Int         = [0-9]+
Comment     = "#" [^\n]*
```

Alternatives are ordered, as in any PEG: the first that matches wins. In
`Atom`, a call is tried before a plain name, and a move before a place or
a name. In `NotCond`, a parenthesized condition is tried before a
comparison.

## 13. Not yet specified

These are open in [LANGUAGE.md](LANGUAGE.md) and are not part of the
language yet:

- **Two composition orders** (open question 2): whether `p(q)` stays
  alongside `p q`, or is limited or dropped.
- **Face pictures** (open questions 7 and 12): a picture without
  `face U`, side stickers, and a cell meaning "either f or r".
- **Captions and pictures** in the file, for the page's method section
  (open question 8).
- **Twist-agnostic cycles** (open question 11): `positions(cube)`, used
  by Singmaster's Place D Corners, and how several cycles after `has`
  combine.
- **Search alternatives** with a depth limit (`(U|D){0,3}`, `U?`) (open
  question 5).
- **Other puzzles, a standard library, a module's puzzle declaration,
  and provenance as data** (open questions 16 and 17).
- **A `releases` clause** for an algo that deliberately undoes earlier
  goals.
- **Comparisons of numbers**: `<` and `>` are taken by conjugates, so
  they would need words.
- The keywords `all` and `in`, reserved for a future `all c in …: …`.

These are not settled either, though LANGUAGE.md doesn't list them as
open:

- The reading order of face pictures for faces other than U.
- `until`: whether the condition is tested before the first pass, and
  what happens when n passes run out and it still doesn't hold.
- `each` with a turn that isn't a quarter turn (`each U2`), which the
  grammar accepts.
- The order of candidates with several generators: "every U within every
  y" and "shortest first" differ (`U2` before `y U`?).
- Scope: whether a definition can be used before it's written, and
  whether a nested `let` can reuse an outer name.
- Whether an algo call can be played in the same `do` as moves
  (`do t lift(p)`).
