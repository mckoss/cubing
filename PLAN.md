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
