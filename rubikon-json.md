# Rubikon JSON

The parser turns a Rubikon file (`.rbk`) into a syntax tree of plain JSON
objects. Everything after the parser (the evaluator, the runtime, the
checker, the page) reads this tree, never the source text. This document
is the format; `src/lib/rubikon/ast.ts` has the same thing as TypeScript
types, and `src/lib/rubikon/parse.spec.ts` has examples of every node.

```ts
import { parseRubikon } from '$lib/rubikon/parse';
const tree = parseRubikon(source); // throws RubikonSyntaxError (line, column)
```

## Conventions

- Every node is an object with a `kind` string, and most have a `loc`:
  `{ "line": 3, "column": 5 }`, 1-based, where the node starts. `loc` is
  left out of the examples below.
- Missing optional parts are `null`, never left out.
- Names are strings as written: `"insertRight"`, `"cfop"`.
- Places are strings in their written spelling (`"uf"`, `"rfu"`), already
  checked to be real places. Corners are spelled clockwise.
- Moves keep their standard notation name and a turn count: `turns` is
  1 (`R`), 2 (`R2`), or 3 (`R'`).

## File

```json
{ "kind": "file", "imports": [ … ], "defs": [ … ] }
```

`defs` holds the top-level `let`, `fun`, and `algo` definitions, in order.

## Imports

| Source                             | JSON                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `import cfop`                      | `{ "kind": "import", "module": "cfop", "alias": null }`                                                                  |
| `import cfop as c`                 | `{ "kind": "import", "module": "cfop", "alias": "c" }`                                                                   |
| `from cfop import sexy, sune as s` | `{ "kind": "from", "module": "cfop", "names": [ { "name": "sexy", "alias": null }, { "name": "sune", "alias": "s" } ] }` |

## Statements

A block (`{ … }`) is an array of statements.

| Kind     | Fields                                                                        | Source                                  |
| -------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| `let`    | `name`, `type` (a type or `null`), `value` (expression)                       | `let t: Moves = R U`                    |
| `fun`    | `name`, `params`, `result` (a type), `body`                                   | `fun f(p: Pattern): Int { return … }`   |
| `algo`   | `name`, `params` (or `null`), `description`, `goal` (condition), `body`       | `algo lift(p: Pattern) "Lift" { … }`    |
| `do`     | `value` (expression)                                                          | `do t F2`                               |
| `return` | `value`                                                                       | `return R U`                            |
| `if`     | `cond`, `then` (block), `else` (block or `null`)                              | `if … { } else if … { } else { }`       |
| `match`  | `cases`, `otherwise` (an action or `null`)                                    | `match { case … -> … otherwise -> … }`  |
| `search` | `generators` (moves), `as`, `cases`, `otherwise`, `else` (a search or `null`) | `search y* U* as t { … } else search …` |
| `each`   | `turn` (a move), `body`                                                       | `each y { … }`                          |
| `until`  | `cond` (a condition, or `{ "kind": "goal" }`), `max`, `body`                  | `until goal max 2 { … }`                |
| `trace`  | `parts`: strings (text) and expressions (printed), in order                   | `trace("after {t}: {cube}")`            |

- **Types:** `{ "name": "Pattern", "arg": null }`; `Set(Location)` is
  `{ "name": "Set", "arg": "Location" }`.
- **Parameters:** `{ "name": "p", "type": { … } }`. An algo's `params` is
  `null` when it has no parameter list (a stage, or `main`), and `[]` for
  `name()`.
- **`else if`** is an `else` holding a one-statement block with the `if`.
- **Cases:** `{ "kind": "case", "cond": …, "action": … }`. An action is a
  `do` statement, or `{ "kind": "nothing" }` for `-> ()`.
- **Trace:** `trace("after {t}: {{x}}")` is
  `{ "kind": "trace", "parts": [ "after ", { "kind": "name", … }, ": {x}" ] }`:
  each `{expr}` is an expression, `{{` and `}}` are already single braces
  in the text, and adjacent text is one string.

## Expressions

| Kind        | Fields                                        | Source                 |
| ----------- | --------------------------------------------- | ---------------------- |
| `move`      | `name` (`"R"`, `"Rw"`, `"M"`, `"y"`), `turns` | `R`, `U2`, `y'`        |
| `seq`       | `items` (two or more)                         | `R U R' U'`            |
| `name`      | `module` (or `null`), `name`                  | `sune`, `cfop.sune`    |
| `location`  | `name`                                        | `uf`, `rfu`            |
| `pattern`   | `cells`, `anyRotation`                        | `/u__/`, `/df/r`       |
| `cycle`     | `places`, `twist` (0, 1 for `+`, 2 for `-`)   | `(uf ur ub)`, `(urf)+` |
| `identity`  |                                               | `()`                   |
| `inverse`   | `of`                                          | `t'`, `(R U)'`         |
| `repeat`    | `of`, `times`                                 | `(R U)3`               |
| `conjugate` | `wrapper`, `body`                             | `R<U>` (R U R')        |
| `call`      | `module`, `name`, `args` (expressions)        | `commutator(R, U)`     |

Pattern cells: `{ "kind": "color", "face": "u" }`, `{ "kind": "any" }`
(`_`), `{ "kind": "not", "face": "u" }` (`!u`).

Examples:

```json
// B'<U'<(R2 U2)3>>
{ "kind": "conjugate",
  "wrapper": { "kind": "move", "name": "B", "turns": 3 },
  "body": { "kind": "conjugate",
    "wrapper": { "kind": "move", "name": "U", "turns": 3 },
    "body": { "kind": "repeat", "times": 3,
      "of": { "kind": "seq", "items": [
        { "kind": "move", "name": "R", "turns": 2 },
        { "kind": "move", "name": "U", "turns": 2 } ] } } } }

// F<R U>'  — the ' applies to the whole conjugate
{ "kind": "inverse", "of": { "kind": "conjugate", … } }
```

- **Items side by side are a `seq`,** whatever they are. The parser doesn't
  decide what a `seq` means: moves in a `seq` are played in order, and
  places in one (`solved(df dr db dl)`, one argument) are a list. The
  evaluator reads it by type.
- **A single item is never wrapped** in a `seq`, and parentheses leave no
  node of their own (`(R U)` is just the `seq`).

## Conditions

| Kind        | Fields                                        | Source                               |
| ----------- | --------------------------------------------- | ------------------------------------ |
| `is`        | `place`, `pattern` (expressions), `negated`   | `uf is /df/`, `uf is not p`          |
| `has`       | `subject`, `cycles`                           | `cube has (uf ur) (ub ul)`           |
| `equals`    | `left`, `right`                               | `p == q`                             |
| `face`      | `face` (`"U"`), `rows` (3 rows of 3 cells)    | `face U [_u_ / uuu / _u_]`           |
| `test`      | `value` (an expression used as true or false) | `solved(df)`                         |
| `and`, `or` | `items` (two or more)                         | `a and b or c` is `or(and(a, b), c)` |
| `not`       | `of`                                          | `not solved(df)`                     |
| `goal`      |                                               | `until goal …`                       |

Precedence, loosest first: `or`, `and`, `not`; parentheses group.
Face picture rows are in reading order for the face (for U: back row
first, then middle, then front).
