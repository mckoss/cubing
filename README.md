# Rubik's Cube Simulator

A Rubik's Cube simulator and solver, live at **[mckoss.com/cubing](https://mckoss.com/cubing/)**.

It was first written in April 2003, using the WildTangent 3D browser plugin
(long gone). The 3D view was redone with Three.js in 2023, and in 2026 the
2003 simulator's controls, permutation engine, and solver were brought back,
with a new Svelte UI.

- Turn faces, slices (M, E, S), and the whole cube (x, y, z) with the
  buttons or the keyboard (Shift for counterclockwise). Drag to turn the view.
- Scramble, and Solve with either solver, watching the whole solution or
  stepping through it move by move or stage by stage.
- The current arrangement is shown in cycle notation, e.g. `(UF UR UB) (URF)+`,
  computed by the `Permutation` class from 2003.
- The move history is grouped into named blocks (Scramble, Solve U Edges,
  ...), with move counts.
- The Move Catalog of useful sequences from 2003, each with its computed
  effect and a Try It button.

## Solvers

Both solvers are table driven, using the rules format of the 2003 code
(`solveVia` in [src/lib/cube/singmaster.ts](src/lib/cube/singmaster.ts)): turn
the cube with a "generator" move until a piece reaches one of a few known
places, then apply the sequence for that place ("P" in a sequence undoes the
generator moves).

- **Singmaster** ([singmaster.ts](src/lib/cube/singmaster.ts)): David
  Singmaster's layer-by-layer solution from _Notes on Rubik's Magic Cube_
  (1981), ported from the 2003 JavaScript. It makes exactly the same moves as
  the 2003 code (tested against its output).
- **Mike's Beginner Method** ([beginner.ts](src/lib/cube/beginner.ts)): the
  common beginner's method, from Mike's handwritten notes
  ([src/lib/assets/basic-solution.png](src/lib/assets/basic-solution.png)).

## Development

Uses Node 24 (LTS), pinned in `.nvmrc`:

```bash
nvm use
npm install
npm run dev        # http://localhost:5173
```

| Command             | Does                                              |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Development server                                |
| `npm run build`     | Static site in `build/` (served from `/cubing`)   |
| `npm run preview`   | Serve the build at http://localhost:4173/cubing/  |
| `npm run check`     | Type check (svelte-check)                         |
| `npm run lint`      | Prettier and ESLint                               |
| `npm run format`    | Format with Prettier                              |
| `npm run test:unit` | Unit tests (Vitest)                               |
| `npm run test:e2e`  | End to end tests (Playwright, desktop and mobile) |
| `npm test`          | All tests                                         |

The first time, install a browser for the end to end tests with
`npx playwright install chromium`. To use a Chromium that's already installed,
set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its path.

## Code

| Path                                                       | What                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| [src/lib/cube/permutation.ts](src/lib/cube/permutation.ts) | Permutations of the cube's pieces (from 2003)          |
| [src/lib/cube/moves.ts](src/lib/cube/moves.ts)             | Moves, notation (standard and 2003), history reduction |
| [src/lib/cube/move-list.ts](src/lib/cube/move-list.ts)     | Move history in named blocks (from 2003)               |
| [src/lib/cube/singmaster.ts](src/lib/cube/singmaster.ts)   | Singmaster solver and the `solveVia` rule engine       |
| [src/lib/cube/beginner.ts](src/lib/cube/beginner.ts)       | Mike's beginner method                                 |
| [src/lib/cube/catalog.ts](src/lib/cube/catalog.ts)         | The 2003 Move Catalog                                  |
| [src/lib/cube/view.ts](src/lib/cube/view.ts)               | Three.js view (from the 2023 version)                  |
| [src/lib/cube/cubies.ts](src/lib/cube/cubies.ts)           | Cubie positions for an NxN cube (2023)                 |
| [src/routes/+page.svelte](src/routes/+page.svelte)         | The page                                               |
| [e2e/](e2e/)                                               | Playwright tests                                       |

## Deployment

[GitHub Actions](.github/workflows/ci.yml) runs lint, type checks, unit tests,
and end to end tests on every push and pull request. On `main`, once they
pass, it builds the site and deploys it to GitHub Pages.
