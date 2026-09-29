# Rubikon Implementation Plan

How we get from the design in [LANGUAGE.md](LANGUAGE.md) to running
[`rubikon/basic.rbk`](rubikon/basic.rbk) on the simulator. Each milestone
ends with tests passing, so work can stop at any of them and still be
useful.

The TypeScript solvers (`src/lib/cube/beginner.ts`, `singmaster.ts`) stay.
They're the benchmarks: a Rubikon method must solve every scramble they
solve, and we compare move counts. Their golden test is unchanged.

## Decisions

- **Code lives in `src/lib/rubikon/`**, next to the cube engine it uses
  (`src/lib/cube/`): the parser, the syntax tree types, the evaluator, and
  the runtime.
- **Peggy** turns the grammar (`rubikon.peggy`) into a parser at run time
  (imported with `?raw`, generated once and cached), so there's no build
  step. If start-up cost ever matters, we can precompile it.
- **The syntax tree is plain JSON** (`kind`-tagged objects, with line and
  column), as the design calls for: the parser produces it, and everything
  after reads it.
- **No statement separators.** Whitespace and newlines are insignificant.
  Every statement and case starts with a keyword, and no keyword can begin
  a move, a name, or a place, so a sequence ends where the next keyword
  starts: `case df is p -> do F2   case fr is p -> do R<U>` is two cases.
  A sequence can run on over several lines.
- **Strict at the edges:** a name made only of face letters (`fur`), a
  counterclockwise corner (`ufr`), a space before a repeat (`(R U) 3`), or
  a misspelled keyword is a parse error with a line and column.

## Documents

- [LANGUAGE.md](LANGUAGE.md): the design notes, with open questions and
  discarded ideas.
- [rubikon.md](rubikon.md): the language specification, the settled
  design only, for writing and implementing Rubikon.
- [rubikon-json.md](rubikon-json.md): the syntax tree the parser makes.

## Milestones

### 1. Parse (this change)

A Peggy grammar for everything `basic.rbk`, `cfop.rbk`, and
`singmaster.rbk` use: imports, `let`, `fun`, `algo` (nesting, parameters,
descriptions, goals), `do`, `if`, `match`, `search … else search`, `each`,
`until goal max n`; move sequences (moves, names, `cfop.sune`, `'`,
`(…)N`, `w<p>`, calls), cycles (`(uf ur ub)`, `(urf)+`, `()`), patterns
(`/u__/`, `/df/r`), face pictures, and conditions (`is`, `is not`, `has`,
`==`, `and`, `or`, `not`, calls).

Tests: each construct alone, the edge cases above, and all three `.rbk`
files parse.

### 2. Moves (subagent A)

Evaluate move expressions to `Move[]` with the engine: sequences,
inverses, repeats, conjugates, `commutator`, `reflect`, `show` (tagged
turns), names from `let` and imports. Test: every `let` in the three files
makes exactly the permutation its comment prints (the check done by hand
so far becomes a unit test).

### 3. Conditions (subagent B)

Evaluate conditions on a cube state: `is` / `is not` against patterns
(wildcards, `!`, `/r`), `solved`, `placed`, `layer`, face pictures, `and`
/ `or` / `not`, `==`. Test against states made with known moves.

Milestones 2 and 3 only share the syntax tree and the engine, so they run
in parallel.

### 4. Runtime

Run algos on a cube and record the moves: `do`, `match`, `if`, `each`,
`until`, `search` (shortest first, `y* U*`, `else search`), parameterized
algos (`do lift(/df/r)`), whole cube turns as frame changes, `show(x)`,
goals (checked at the end, bypass when already true, persistent), and a
trace grouped by algo. Test: each construct, then each stage of Basic
from states where the earlier goals hold.

**One run, two uses.** The runtime reads the syntax tree and produces a
stream of events: a move (visible, or a frame change that renames what
follows), entering an algo (with its description), leaving it, and an
algo bypassed because its goal already holds. The same stream drives the
cube simulator, move by move, and builds the execution trace, grouped by
algo like the blocks in the demo's move list (`MoveList.openBlock`), with
counts and "next stage" stepping.

**Done** (`src/lib/rubikon/runtime.ts`, `values.ts`; tests in
`runtime.spec.ts`):

- [x] One environment (`values.ts`): moves, permutations, places, lists of
      places, patterns, Bools, funs, and algos, read by the moves
      evaluator, the condition evaluator (which now evaluates any
      expression, `evaluateValue`), and the runtime.
- [x] `let`, `do` (moves, an algo, `do lift(/df/r)`, `do t F2`, and the
      two mixed: `do t lift(p)`), `match`, `if`/`else`, `each`, `until`,
      `search` (with `else search` and `otherwise`), `fun`/`return`,
      nested stages, `show(x)`.
- [x] Goals: bypassed when they hold at the start, checked at the end,
      persistent (every goal reached is checked at the end of every later
      algo), each read in the frame its algo started in.
- [x] Whole cube turns as frame changes: the state is relative to how the
      cube is held, so conditions read the current frame; the events carry
      the turn with `visible: false`, and `physicalMoves()` renames the
      moves after it for display.
- [x] `trace("…")` (grammar, syntax tree, and `trace` events).
- [x] Limits: moves, steps, and nesting depth, each an error with a
      position. Every error is a `RubikonError` with line and column.
- [x] `runMain(file, state, listener, modules)` runs `algo main`, with
      imports from already parsed modules (full module loading is 5).
- [x] Each stage of `basic.rbk` from states where the earlier goals hold,
      and `main` solving random scrambles: 100 in the tests (2000 tried
      once, all solved), 125.9 face turns on average against 129.6 for the
      TypeScript Basic solver.

**`trace("…")` (low priority, for debugging).** One more event in the
same stream: the formatted text and its line. The history shows it in
place, inside the current algo's block between its moves; with no page,
the stream prints to the console. The page and the playground get a
"Show trace" checkbox that shows or hides these lines (the moves and algo
blocks stay). The format string rule (`{expr}`, `{{`, `}}`), the printer
for every value kind, and the event are done, and the playground shows
the lines with its "Show trace" checkbox; the main page and printing to
the console are left.

### 5. Modules

`import`, `from … import … as …`, qualified names, `main`, finding files,
circular imports, the unused-import warning. `basic.rbk` imports
`cfop.rbk`.

### 6. Basic end to end

`basic.rbk` solves random scrambles. Benchmark against the TypeScript
Basic solver: both solve the same 1000 scrambles; compare move counts.
A golden test of the Rubikon output (separate from the 2003 one).

### 7. Checker

Types and kinds (Pattern ⊃ Cubie ⊃ Edge/Corner; Location kinds), typed
`fun` and algo parameters, kind mismatches (`df is /dfr/`), dead cases,
unused imports, `max n` bounds that can't be reached.

### 8. Playground

A new page: the player, with a code window beside it. Type Rubikon (a
`let`, a `do`, an algo, a whole method), run it, and watch the moves on
the cube, with parse and runtime errors shown at their line. Programs are
saved by name in the browser (local storage), and the library can be
listed, paged through, opened, edited, renamed, and deleted. It can start
as soon as milestone 2 works (play a `let` or `do`), and grows with the
runtime.

Done (`src/routes/playground/`): the page, with the player and history
shared with the main page (`Player`, `CubePlayer`, `MoveHistory`, and a
Scramble button from `Player.scramble()`); a code window with line
numbers; parse, evaluation, and runtime errors shown with line:column,
the line marked and selected, and an error in an imported module shown
with the module's name (`cfop 12:5`: each error keeps its syntax tree
`loc`, which says whose tree it's in). Run runs `algo main` with the
runtime (`runMain`, with each imported library program parsed and passed
as a module) on a solved cube ("From solved") or the cube as it is
(Scramble unchecks "From solved"); the history shows the algo blocks,
bypass notes, and trace lines as the run makes them, through
`RunRecorder`. A run is limited (10,000 moves, 1,000,000 steps) so a
program that loops stops with an error; it's synchronous (`basic` on a
scramble takes a moment). Without a main, or when chosen from the Run
menu (main, the last let, or any let), Run plays a let: the lets are
evaluated with the runtime's `evaluateModule`/`evaluateLets` (top level
and inside algos without parameters). A line of moves (`sune`, `F<R U>`)
plays against the program's names; imports come from the library by
name. The library (`library.ts`) saves, lists, pages through, opens,
renames, and deletes programs, remembers the last one open, starts with
copies of `cfop.rbk` and `basic.rbk`, and works in memory when local
storage is unavailable. Every run goes through one adapter
(`record.ts`): run events become history blocks (enter/leave), notes
(bypass, trace, with a "Show trace" checkbox), and moves, with whole cube
turns that aren't shown renamed away by the runtime's `renameMove` (so
the history agrees with `physicalMoves()`). Decided: a history block's
title is the algo's description if it has one, else its name (`algo
lift(p) "Lift a piece to the top"` shows as "Lift a piece to the top").

Left: running a long program without blocking the page (in a worker, or
in slices).

### 9. On the page

The page offers each `.rbk` file with a `main` as a method; the history
groups moves by algo, with descriptions.

### 10. Singmaster

Needs the open questions settled: `cube has (…)` with several cycles,
`positions(cube)`. Benchmark against the TypeScript Singmaster.

## Subagents

After milestone 1, the syntax tree is fixed, and milestones 2 and 3 are
independent: two agents, each in its own worktree, each with its own files
and tests. Milestone 4 needs both. Later, the checker (7), the playground
(8), and the page (9) can run alongside 5 and 6.

## Design questions from implementing

Things that turned out awkward to implement, which may mean the design
should change:

- **Side by side means two things.** `R U` is a move sequence, but
  `solved(df dr db dl)` is a list of places, and the parser can't tell
  them apart: both are a `seq`, and the evaluator decides by type. Commas
  (`solved(df, dr, db, dl)`) would make lists explicit.
- **Single letters that are faces can't be names:** `b`, `d`, `f`, `l`,
  `r`, `u` read as places, so `fun f(…)` or `let d = …` is an error. It's
  the stated rule (names made only of face letters are places), but short
  names are where it bites.
- **A face or slice argument is an ordinary expression.** `reflect(p, M)`
  gets a move token, so `reflect(p, M2)` or a name there is only caught
  when it's evaluated; the checker (7) should check `Face`/`Slice`
  arguments. Likewise `show(x y)` parses and is rejected only because its
  argument isn't a single turn.
- **Wide turns parse, but the engine has none:** `Rw` is an evaluation
  error until the engine gets wide turns.
- **`let` holds more than moves:** the evaluator takes `let` to be `Moves`,
  but `let piece = cubie(df)` will need other types. The runtime (4)
  needs values of every type in one environment.
- **Qualified and bare names from the same module** (`import cfop` and
  `from cfop import sune`) have no rule yet for being used together.
- **Imported names have no `loc`:** an error about one name in
  `from cfop import sexy, nope` can only point at the whole import line.
- **Two imports can give the same prefix** (`import cfop` and
  `import other as cfop`); the error names the first clashing qualified
  name (`Imported twice: cfop.sune`), not the clashing prefix.
- **`cube == ()` and `solved(cube)` disagree** on a solved cube that has
  been turned: `==` compares the raw state, `solved` allows any way of
  holding it. `==` on cube states probably shouldn't exist, or should mean
  "the same up to how it's held".
- **Slice turns and "solved".** Colors are relative to the centers, so
  after `M` the cube reads as R and L turned: `solved(cube)` is false,
  which is right, but a stage like "place the centers" can't be written
  as a condition on centers (they're always "solved").
- **`layer()` of a slice** (`layer(M)`) isn't specified; the evaluator
  takes it to be the slice's centers and edges. So after `M`,
  `solved(layer(M))` is true (the slice reads as solved, relative to the
  centers that moved with it) while `solved(cube)` is false.
- **Face pictures** have a reading order only for U.
- **Two environments.** The moves evaluator and the condition evaluator
  each have their own `Env` (names to moves; names to patterns and
  places). The runtime needs one environment holding values of every
  type.
- **Lets inside algos.** The playground lists and plays the lets inside
  algos (as `main › insertRight`), and lets a line of moves use them, but
  in the language they're only in scope inside their algo. Lets in an
  algo with parameters are skipped, since they may use the parameters.
- **Hidden whole cube turns and the history.** The history shows moves
  as played on the cube as it's held, so after a hidden `y` the program's
  `R` is recorded as `B`; the history no longer reads like the source.
  Showing both (as written, and as played) may be wanted.
- **Where imports come from** in the browser: the playground finds
  `import cfop` by a library program's name, so a program's name is its
  module name, and renaming it breaks its importers.
- **Where to start a run.** The playground offers "From solved" (reset
  before each run) or playing on from the current cube; a program has no
  way to say what state it expects (a scramble, a setup).
- **`until` is tested before each pass** (so it may run none), and running
  out of passes with the condition still false is an error. The spec
  leaves both open.
- **Goals are enforced as persistent**, at the end of every algo,
  including algos called with `do` (`lift`): a macro may disturb earlier
  goals only if it restores them by its own end. A bypassed goal counts as
  reached. A goal is read in its algo's scope (parameters), not its body's
  (a `let` in the body can't be named in the goal).
- **Every consumer has to rename moves after a frame change.** The move
  event carries the move as written (`R` after an unseen `y`), so the
  simulator, the trace, and a move count each need `physicalMoves()` (or
  their own frame). The event could carry the move as shown as well.
- **An algo that does nothing still shows up.** `lift` is entered and
  left for every piece, even when its `otherwise -> ()` makes no moves,
  so the trace has many empty "Lift a piece to the top" entries. The page
  may want to hide empty algos (bypass is only for goals).
- **A fun can't return a condition.** `return` takes an expression, so a
  `fun …: Bool` can return `solved(…)` or a Bool name, but not
  `uf is p` or `a and b`. Likewise `{…}` in `trace` takes an expression,
  not a condition.
- **Single letters bite in tests too:** `fun f`, `let x`, `let b`, and
  `import b` are all errors (face letters are places, `x y z` are moves).
- **Definitions at the top level:** lets are bound in order, but funs and
  algos are looked up when called, so an algo can call one defined after
  it. The spec leaves use before definition open.
- **`==` on moves** now compares the permutations they make
  (`cube == R U R' U'`), since conditions evaluate moves too.
- **Resolved by the runtime:** "`let` holds more than moves" and "Two
  environments" above: `values.ts` has one `Env` of values of every kind.
  The order of `search y* U*` too: fewest turns first, then the first
  generator varies slowest (`U2` before `y U`), as rubikon.md now says.

### From writing the specification

Writing [rubikon.md](rubikon.md) from the design notes and the grammar
turned up gaps and disagreements:

- **Application `p(q)`** only parses when `p` is a name: `R(U)` reads as
  the sequence `R U`, and `inverse(F2)(df)` as a call and then a place.
  Either drop application (open question 2) or give it a syntax.
- **Spaces between items** are only required after a move: `sune'sexy`,
  `(R U)(F)`, and `R<U>F` all parse. Require them everywhere?
- **Not in the grammar yet:** `colors { … }`, `all c in …: …` (`all` and
  `in` are reserved but unused), number literals in expressions (so an
  `Int` result can't be compared with anything).
- **Conditions aren't values:** a `fun` can't return `Bool` from an `is`
  test, and `let b = uf is /df/` isn't possible.
- **The grammar accepts** an unnamed algo with parameters, parameterized
  algos nested in others, `do` inside a `fun`, `R''`, `else if`, and any
  capitalized word as a type; the checker (7) should reject what the
  design forbids.
- **Underspecified:** whether `until` tests before its first pass, and
  what happens when `max` runs out; `until goal` in an algo without a
  goal; `each U2` or `each R'`; scoping and forward references; a
  search with both `otherwise` and `else search` (the `else` can never
  run); a top-level algo without a name (can never be called); whether
  `do t lift(p)` mixes moves and an algo call.
- **Printing:** the canonical cycle spelling scores any edge read from F
  or B, not only middle edges as LANGUAGE.md says.
