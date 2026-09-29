# Changelog

The simulator and the Rubikon playground share one version, shown beside
each page's title. It follows [semantic versioning](https://semver.org):
the major version changes when something a user relies on changes, the
minor version for new features, and the patch for fixes.

## 2.1.0 (2026-09-29)

- Cube Racing, at the bottom of the playground: race a program's
  `algo main`, or one of the TypeScript solvers, on 500 random scrambles
  made from a seed, and see the best, worst, average, and median number of
  moves (counted as the move history counts them), a histogram, and any
  cube it couldn't solve, with why; Load cube puts that cube on the page to
  run it again. Races run in the background with a Cancel button, your
  results are kept in the browser, and the site comes with results for
  basic.rbk and both TypeScript solvers (`npm run build:benchmarks`; a test
  checks they're current).

## 2.0.0 (2026-09-29)

The simulator rebuilt as a Svelte site, with the 2003 simulator's
controls, permutation engine, and solver brought back.

- Face, slice, and whole cube turns with buttons or the keyboard; Scramble;
  Solve with the Singmaster solver or the Basic Modern Solution, played
  through or stepped move by move and algo by algo (Next algo).
- The move history, grouped by algo and in step with the cube: moves not
  yet played are dimmed, and the current move and its algos are marked.
- The current permutation in cycle notation, and a catalog of sequences
  with their effects.
- The Rubikon playground: write Rubikon, run any algo or named sequence on
  the cube, keep a library of programs in the browser, and see `trace`
  lines in the history.
- A favicon of the site's own cube.

## 1.0.0 (April 2003)

The first simulator, in the WildTangent 3D browser plugin (long gone). Its
3D view was redone with Three.js in 2023.
