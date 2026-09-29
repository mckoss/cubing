<script lang="ts">
	import { VERSION } from '$lib/version';
	import { onDestroy, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Player } from '$lib/cube/player.svelte';
	import CubePlayer from '$lib/components/CubePlayer.svelte';
	import CurrentPermutation from '$lib/components/CurrentPermutation.svelte';
	import MoveHistory from '$lib/components/MoveHistory.svelte';
	import { formatTaggedMoves } from '$lib/rubikon/moves';
	import { RunRecorder, applyEvents } from '$lib/rubikon/record';
	import type { RunEvent } from '$lib/rubikon/events';
	import { Library, browserStorage, type Program } from '$lib/rubikon/library';
	import {
		ProgramError,
		evaluateMovesLine,
		evaluateProgram,
		playEvents,
		runAlgo,
		runProgram,
		type AlgoEntry,
		type EvaluatedProgram,
		type LetEntry
	} from '$lib/rubikon/playground';
	import {
		RACE_COUNT,
		TYPESCRIPT_SOLVERS,
		isTypeScriptSolverId,
		raceScramble,
		type RaceResult,
		type Racer
	} from '$lib/rubikon/racing';
	import {
		BUILT_IN_RACES,
		RaceLog,
		canLoadCubes,
		raceKey,
		startRace,
		type RunningRace
	} from '$lib/rubikon/races';
	import cfopSource from '../../../rubikon/cfop.rbk?raw';
	import basicSource from '../../../rubikon/basic.rbk?raw';

	const player = new Player();

	// The examples the library starts with (copies: they can be edited).
	const library = new Library(browserStorage(), [
		{ name: 'cfop', source: cfopSource },
		{ name: 'basic', source: basicSource }
	]);
	// Bumped whenever the library changes, to update the page.
	let libraryVersion = $state(0);
	const programs = $derived.by((): Program[] => {
		void libraryVersion;
		return library.list();
	});

	// The program being edited: its name, its text, and the saved program it
	// was opened from (null for a new one).
	const first = library.get(library.lastOpen ?? '') ?? library.list()[0];
	let openName: string | null = $state(first?.name ?? null);
	let name = $state(first?.name ?? 'untitled');
	let source = $state(first?.source ?? '');
	const dirty = $derived.by(() => {
		void libraryVersion;
		const saved = openName === null ? undefined : library.get(openName);
		return saved === undefined
			? source.trim() !== ''
			: saved.source !== source || name !== openName;
	});
	const persisted = $derived.by(() => {
		void libraryVersion;
		return library.persisted;
	});
	const index = $derived(programs.findIndex((p) => p.name === openName));

	let program: EvaluatedProgram | undefined = $state();
	let error: ProgramError | undefined = $state();
	let status = $state('');
	// What Run runs, as chosen: 'main', another algo ('algo:' and its index
	// in program.algos), a named sequence ('let:' and its index in
	// program.lets), or 'last' (the last one); null for the default: main,
	// else the first algo, else the last named sequence.
	let runChoice: string | null = $state(null);
	const runWhat = $derived.by((): string => {
		if (program === undefined) return runChoice ?? 'main';
		const [kind, at] = (runChoice ?? '').split(':');
		const valid =
			runChoice === 'last' ||
			(runChoice === 'main' && program.hasMain) ||
			(kind === 'algo' && Number(at) < program.algos.length) ||
			(kind === 'let' && Number(at) < program.lets.length);
		if (valid && runChoice !== null) return runChoice;
		return program.hasMain ? 'main' : program.algos.length > 0 ? 'algo:0' : 'last';
	});
	let playLine = $state('');
	let playError: ProgramError | undefined = $state();
	let showTrace = $state(true);

	let textarea: HTMLTextAreaElement;
	let gutter: HTMLElement;
	let playInput: HTMLInputElement;

	const lineNumbers = $derived(Array.from({ length: source.split('\n').length }, (_, i) => i + 1));
	const errorLine = $derived(error?.module === null ? error.line : null);

	// An imported module: the program being edited if it's the one named,
	// else from the library.
	function findModule(moduleName: string): string | undefined {
		return moduleName === name.trim() ? source : library.get(moduleName)?.source;
	}

	function showError(e: unknown): ProgramError {
		if (e instanceof ProgramError) return e;
		throw e;
	}

	// Parse and evaluate the program; shows any error.
	function evaluate(): EvaluatedProgram | undefined {
		try {
			program = evaluateProgram(source, findModule);
			error = undefined;
		} catch (e) {
			program = undefined;
			error = showError(e);
			void jumpTo(error);
		}
		return program;
	}

	// Record events on the player, and play them.
	function run(events: RunEvent[]): void {
		player.startSolution();
		applyEvents(events, player.moveList);
		player.changed();
	}

	function play(entry: LetEntry): void {
		run(playEvents(entry.name, entry.moves, entry.loc));
		// The history counts the moves (as it does for main).
		status = `Played ${entry.name}.`;
	}

	// Run the program's algo main, or another algo by itself, on the cube as
	// it is, showing the moves, algos, and trace lines in the history as
	// they come.
	function runMain(evaluated: EvaluatedProgram, algo?: AlgoEntry): void {
		const start = player.finalPerm();
		player.startSolution();
		const recorder = new RunRecorder(player.moveList);
		try {
			if (algo === undefined) {
				runProgram(evaluated, start, recorder.listener);
			} else {
				runAlgo(evaluated, algo, start, recorder.listener);
			}
			status = `Ran ${algo === undefined ? 'main' : pathLabel(algo.path)}.`;
		} catch (e) {
			error = showError(e);
			void jumpTo(error);
		} finally {
			recorder.finish();
			player.changed();
		}
	}

	// Run: evaluate the program, and run what's chosen (see runWhat).
	function runChosen(): void {
		status = '';
		const evaluated = evaluate();
		if (evaluated === undefined) return;
		const [kind, at] = runWhat.split(':');
		if (runWhat === 'main' && evaluated.hasMain) {
			runMain(evaluated);
			return;
		}
		const algo = kind === 'algo' ? evaluated.algos[Number(at)] : undefined;
		if (algo !== undefined) {
			runMain(evaluated, algo);
			return;
		}
		const entry = evaluated.lets.at(kind === 'let' ? Number(at) : -1);
		if (entry === undefined) {
			status = 'Nothing to run yet: add an algo or a named sequence (a let), or type moves below.';
			return;
		}
		play(entry);
	}

	function playTyped(ev: SubmitEvent): void {
		ev.preventDefault();
		status = '';
		const text = playLine.trim();
		if (text === '') return;
		// Plain moves play even when the program has an error.
		const scope = evaluate()?.scope ?? new Map();
		try {
			const moves = evaluateMovesLine(text, scope);
			playError = undefined;
			run(playEvents(text, moves, { line: 1, column: 1 }));
		} catch (e) {
			playError = showError(e);
			const at = (playError.column ?? 1) - 1 + (playLine.length - playLine.trimStart().length);
			playInput.focus();
			playInput.setSelectionRange(at, at + 1);
		}
	}

	// Select the place an error is at, in the editor.
	async function jumpTo(at: {
		line: number | null;
		column: number | null;
		module?: string | null;
	}): Promise<void> {
		if (at.line === null || (at.module ?? null) !== null) return;
		await tick();
		const lines = source.split('\n');
		let offset = 0;
		for (let i = 0; i < at.line - 1 && i < lines.length; i++) {
			offset += (lines[i]?.length ?? 0) + 1;
		}
		offset += (at.column ?? 1) - 1;
		textarea.focus();
		textarea.setSelectionRange(offset, offset + 1);
		// Scroll the line into view (the text doesn't wrap).
		const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
		const top = (at.line - 1) * lineHeight;
		if (top < textarea.scrollTop || top > textarea.scrollTop + textarea.clientHeight - lineHeight) {
			textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
		}
	}

	function syncGutter(): void {
		gutter.scrollTop = textarea.scrollTop;
	}

	function editorKeydown(ev: KeyboardEvent): void {
		if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
			ev.preventDefault();
			runChosen();
		} else if (ev.key === 'Tab' && !ev.shiftKey) {
			// Indent with two spaces, as the examples do.
			ev.preventDefault();
			const { selectionStart: start, selectionEnd: end } = textarea;
			source = source.slice(0, start) + '  ' + source.slice(end);
			void tick().then(() => textarea.setSelectionRange(start + 2, start + 2));
		}
	}

	// --- The library ---

	function changedLibrary(): void {
		libraryVersion++;
	}

	// Leaving unsaved changes needs a yes.
	function mayLeave(): boolean {
		return !dirty || confirm(`Discard the changes to ${name}?`);
	}

	// Leaving the page too: closing it or reloading asks with the browser's
	// own question (which cancel() brings up), a link with ours.
	beforeNavigate(({ type, cancel }) => {
		if (dirty && (type === 'leave' || !mayLeave())) cancel();
	});

	function open(p: Program): void {
		if (p.name === openName || !mayLeave()) return;
		openName = p.name;
		name = p.name;
		source = p.source;
		library.lastOpen = p.name;
		program = undefined;
		error = undefined;
		runChoice = null;
		status = '';
		changedLibrary();
		void tick().then(() => {
			textarea.scrollTop = 0;
			syncGutter();
		});
	}

	function page(step: number): void {
		const count = programs.length;
		if (count === 0) return;
		const next = programs[(((index < 0 ? 0 : index + step) % count) + count) % count];
		if (next !== undefined) open(next);
	}

	function save(): void {
		const trimmed = name.trim();
		if (trimmed === '') {
			status = 'A program needs a name.';
			return;
		}
		if (
			trimmed !== openName &&
			library.has(trimmed) &&
			!confirm(`Replace the saved program ${trimmed}?`)
		) {
			return;
		}
		const saved = library.save(trimmed, source);
		openName = saved.name;
		name = saved.name;
		library.lastOpen = saved.name;
		status = library.persisted
			? `Saved ${saved.name}.`
			: `Saved ${saved.name} for now: this browser won't store it, so it's gone when the page closes.`;
		changedLibrary();
	}

	function newProgram(): void {
		if (!mayLeave()) return;
		let n = 1;
		while (library.has(`untitled${n === 1 ? '' : n}`)) n++;
		openName = null;
		name = `untitled${n === 1 ? '' : n}`;
		source = '';
		program = undefined;
		error = undefined;
		runChoice = null;
		status = '';
		library.lastOpen = null;
		changedLibrary();
		void tick().then(() => textarea.focus());
	}

	// Renaming in the library list: the program being renamed, and its new
	// name.
	let renaming: string | null = $state(null);
	let newName = $state('');

	function startRename(p: Program): void {
		renaming = p.name;
		newName = p.name;
	}

	function finishRename(ev: SubmitEvent): void {
		ev.preventDefault();
		if (renaming === null) return;
		try {
			const renamed = library.rename(renaming, newName);
			if (openName === renaming) {
				// Keep an edited name only if it was edited.
				if (name === openName) name = renamed.name;
				openName = renamed.name;
			}
			status = `Renamed ${renaming} to ${renamed.name}.`;
			renaming = null;
		} catch (e) {
			status = e instanceof Error ? e.message : String(e);
		}
		changedLibrary();
	}

	function remove(p: Program): void {
		if (!confirm(`Delete ${p.name} from the library?`)) return;
		library.delete(p.name);
		if (openName === p.name) {
			// Keep the text, as a new program (so it can be saved again).
			openName = null;
		}
		status = `Deleted ${p.name}.`;
		changedLibrary();
	}

	function lines(p: Program): number {
		return p.source.replace(/\n$/, '').split('\n').length;
	}

	function when(time: number): string {
		return new Date(time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	}

	function pathLabel(path: string[]): string {
		return path.join(' › ');
	}

	// --- Cube Racing ---

	// How many cubes a race has: 500, or fewer with `?raceCount=20` in the
	// URL (for tests).
	const raceCount = ((): number => {
		const asked = Number(new URLSearchParams(window.location.search).get('raceCount'));
		return Number.isInteger(asked) && asked > 0 ? Math.min(asked, RACE_COUNT) : RACE_COUNT;
	})();

	const raceLog = new RaceLog(browserStorage());
	let myRaces: RaceResult[] = $state(raceLog.list());
	const allRaces = $derived([...myRaces, ...BUILT_IN_RACES]);

	// Whether a program has an algo main to race (a quick look: a race of
	// one that doesn't says so).
	function hasMain(text: string): boolean {
		return /^\s*algo\s+main\b/m.test(text);
	}

	// What can race: the program being edited ('open'), the library's other
	// programs with an algo main ('lib:' and a name), and the TypeScript
	// solvers ('ts:' and an id).
	const raceOptions = $derived.by((): { value: string; label: string }[] => {
		const options: { value: string; label: string }[] = [];
		if (hasMain(source)) {
			options.push({
				value: 'open',
				label: `${name.trim() || 'untitled'}${dirty ? ' (edited)' : ''}`
			});
		}
		// A saved program is left out only when it's the one open, under its
		// own name (renamed and not yet saved, the saved copy still races).
		const openSaved = openName !== null && name.trim() === openName ? openName : null;
		for (const p of programs) {
			if (p.name !== openSaved && hasMain(p.source)) {
				options.push({ value: `lib:${p.name}`, label: p.name });
			}
		}
		for (const [id, solver] of Object.entries(TYPESCRIPT_SOLVERS)) {
			options.push({ value: `ts:${id}`, label: solver.name });
		}
		return options;
	});
	let raceChoice: string | null = $state(null);
	const raceWhat = $derived(
		raceOptions.some((o) => o.value === raceChoice)
			? (raceChoice ?? 'open')
			: (raceOptions[0]?.value ?? 'ts:basic')
	);
	let raceSeed: number | null = $state(1);
	let racing: RunningRace | null = $state(null);
	let raceProgress = $state(0);
	let raceStatus = $state('');
	let raceError = $state('');
	// The row whose histogram is shown, and the row whose unsolved cubes
	// are listed (by raceKey).
	let selectedRace: string | null = $state(null);
	let failuresOf: string | null = $state(null);
	const shownRace = $derived(allRaces.find((r) => raceKey(r) === selectedRace) ?? allRaces[0]);
	const failedRace = $derived(allRaces.find((r) => raceKey(r) === failuresOf));

	let playerSection: HTMLElement;

	// The racer for the choice: a program with the library's programs to
	// import (the one being edited as it is now, as Run imports it).
	function racerFor(choice: string): Racer | undefined {
		const modules: Record<string, string> = {};
		for (const p of library.list()) modules[p.name] = p.source;
		if (name.trim() !== '') modules[name.trim()] = source;
		if (choice === 'open') {
			return { kind: 'rubikon', name: name.trim() || 'untitled', source, modules };
		}
		if (choice.startsWith('lib:')) {
			const saved = library.get(choice.slice(4));
			return saved && { kind: 'rubikon', name: saved.name, source: saved.source, modules };
		}
		const id = choice.slice(3);
		return isTypeScriptSolverId(id) ? { kind: 'typescript', id } : undefined;
	}

	function startRacing(): void {
		raceStatus = '';
		raceError = '';
		const seed = raceSeed;
		// Seeds are 32-bit integers (as mulberry32 takes them).
		if (seed === null || !Number.isInteger(seed) || seed < -(2 ** 31) || seed > 2 ** 31 - 1) {
			raceError = 'The seed is a whole number from -2147483648 to 2147483647.';
			return;
		}
		const racer = racerFor(raceWhat);
		if (racer === undefined) return;
		raceProgress = 0;
		racing = startRace(
			{ racer, seed, count: raceCount },
			{
				progress: (done): void => {
					raceProgress = done;
				},
				done: (result): void => {
					racing = null;
					raceLog.add(result);
					myRaces = raceLog.list();
					selectedRace = raceKey(result);
					const unsolved = result.stats.count - result.stats.solved;
					raceStatus =
						(result.stopped === undefined
							? `Raced ${result.name}: `
							: `${result.stopped}: ${result.name} raced `) +
						`${result.stats.solved} of ${result.stats.count} solved` +
						(unsolved > 0 ? `, ${unsolved} not.` : '.') +
						(raceLog.persisted ? '' : " (This browser won't keep it.)");
					focusRace();
				},
				error: (message): void => {
					racing = null;
					raceError = message;
					focusRace();
				}
			}
		);
	}

	function cancelRace(): void {
		racing?.cancel();
		racing = null;
		raceStatus = 'Race cancelled.';
		focusRace();
	}

	// Back to the Race button (it replaces Cancel when a race is over).
	let raceButton: HTMLButtonElement | undefined = $state();
	function focusRace(): void {
		void tick().then(() => raceButton?.focus({ preventScroll: true }));
	}

	// A race still running when the page goes away is stopped.
	onDestroy(() => racing?.cancel());

	function clearRaces(): void {
		if (!confirm('Clear your race results?')) return;
		raceLog.clear();
		myRaces = raceLog.list();
		raceStatus = 'Cleared your race results.';
	}

	// Put a race's cube on the page, scrambled, to run the program on it.
	function loadCube(result: RaceResult, index: number): void {
		player.reset();
		player.play(raceScramble(result.seed, index), `Race cube ${index + 1} (seed ${result.seed})`);
		const loaded = `Loaded cube ${index + 1} of seed ${result.seed}`;
		if (result.kind === 'typescript') {
			status = `${loaded}. ${result.name} is one of the simulator's solvers: it runs with Solve on the Rubik's Cube Simulator page, not here.`;
		} else if (result.name === (name.trim() || 'untitled')) {
			// Run runs main, as the race did.
			runChoice = 'main';
			status = `${loaded}: Run to watch it.`;
		} else {
			status = `${loaded}: open ${result.name} from the library, then Run to watch it.`;
		}
		playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function day(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
	}

	function stat(value: number | null): string {
		return value === null ? '–' : String(value);
	}

	// A histogram's bars: how many cubes took each few moves (bins of
	// `width`), from the fewest moves to the most.
	function bars(histogram: [number, number][], width = 5): { from: number; cubes: number }[] {
		if (histogram.length === 0) return [];
		const first = Math.floor((histogram[0]?.[0] ?? 0) / width) * width;
		const last = histogram.at(-1)?.[0] ?? first;
		const result = Array.from({ length: Math.floor((last - first) / width) + 1 }, (_, i) => ({
			from: first + i * width,
			cubes: 0
		}));
		for (const [moves, cubes] of histogram) {
			const bar = result[Math.floor((moves - first) / width)];
			if (bar !== undefined) bar.cubes += cubes;
		}
		return result;
	}
	const shownBars = $derived(bars(shownRace?.stats.histogram ?? []));
	const tallest = $derived(Math.max(1, ...shownBars.map((b) => b.cubes)));
	const barTotal = $derived(shownBars.reduce((sum, b) => sum + b.cubes, 0));
	// The bar under the pointer (or tapped), whose range and share are shown.
	let hoveredBar = $state<number | null>(null);
	const hovered = $derived(hoveredBar === null ? undefined : shownBars[hoveredBar]);
	function barText(bar: { from: number; cubes: number }): string {
		const share = barTotal === 0 ? 0 : (bar.cubes / barTotal) * 100;
		const cubes = bar.cubes === 1 ? '1 cube' : `${bar.cubes} cubes`;
		return `${bar.from}–${bar.from + 4} moves · ${cubes} (${share.toFixed(1)}%)`;
	}
	// The histogram in words, for screen readers.
	const histogramLabel = $derived.by((): string => {
		const peak = shownBars.find((b) => b.cubes === tallest);
		const stats = shownRace?.stats;
		if (peak === undefined || stats === undefined) return '';
		return (
			`Moves to solve, from ${stats.best} to ${stats.worst}; ` +
			`most cubes (${peak.cubes}) took ${peak.from} to ${peak.from + 4} moves.`
		);
	});
</script>

<svelte:window onkeydown={(ev): void => player.keydown(ev)} />

<svelte:head>
	<title>Rubikon Playground</title>
	<meta
		name="description"
		content="Type Rubikon, the language for Rubik's Cube methods, and watch it play on the cube."
	/>
</svelte:head>

<header>
	<h1>Rubikon Playground <small class="version" data-testid="version">v{VERSION}</small></h1>
	<p class="byline">
		Type Rubikon and watch it play on the cube. · <a href={resolve('/')}>Rubik's Cube Simulator</a>
	</p>
</header>

<main>
	<section class="card editor">
		<div class="file-bar">
			<input
				class="name"
				bind:value={name}
				aria-label="Program name"
				spellcheck="false"
				data-testid="program-name"
			/>
			{#if dirty}<span class="dirty" data-testid="dirty">edited</span>{/if}
			<button class="primary" onclick={save} data-testid="save">Save</button>
			<button onclick={newProgram} data-testid="new">New</button>
			<span class="pager" role="group" aria-label="Library pages">
				<button
					onclick={(): void => page(-1)}
					disabled={programs.length === 0}
					aria-label="Previous program"
					data-testid="prev">‹</button
				>
				<span class="position" data-testid="position"
					>{index < 0 ? '–' : index + 1} of {programs.length}</span
				>
				<button
					onclick={(): void => page(1)}
					disabled={programs.length === 0}
					aria-label="Next program"
					data-testid="next">›</button
				>
			</span>
		</div>

		<div class="code">
			<div class="gutter" bind:this={gutter} aria-hidden="true">
				{#each lineNumbers as n (n)}
					<span class:error-line={errorLine === n}>{n}</span>
				{/each}
			</div>
			<textarea
				bind:this={textarea}
				bind:value={source}
				onscroll={syncGutter}
				onkeydown={editorKeydown}
				wrap="off"
				spellcheck="false"
				autocapitalize="off"
				autocomplete="off"
				aria-label="Rubikon program"
				data-testid="source"></textarea>
		</div>

		{#if error}
			<p class="error" role="alert" data-testid="error">
				{#if error.line !== null}
					<button
						class="where"
						onclick={(): Promise<void> => jumpTo(error ?? { line: null, column: null })}
						>{error.where}</button
					>
				{/if}
				{error.message}
			</p>
		{/if}
		{#if status}<p class="status" data-testid="status">{status}</p>{/if}

		{#if program}
			<details class="lets" open>
				<summary>Named Sequences ({program.lets.length})</summary>
				{#if program.lets.length === 0}
					<p class="note">No named sequences (lets) to play.</p>
				{/if}
				<ul data-testid="lets">
					{#each program.lets as entry, i (i)}
						<li>
							<button class="play" onclick={(): void => play(entry)} aria-label="Play {entry.name}"
								>▶</button
							>
							<button class="let-name" onclick={(): Promise<void> => jumpTo(entry.loc)}
								>{#each entry.path as outer, k (k)}<span class="path"
										>{outer} ›
									</span>{/each}{entry.name}</button
							>
							<code>{formatTaggedMoves(entry.moves) || '()'}</code>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
		<p class="note">
			Run (under the cube, or Ctrl+Enter here) runs the program's <code>algo main</code> on the cube
			as it is, or another algo without parameters by itself, or plays a named sequence (a
			<code>let</code>), as chosen next to it; Reset first to start from solved. Imports come from
			the library, by name. Cube Racing, at the bottom of the page, races a program's
			<code>algo main</code> on 500 scrambles and keeps its numbers.
		</p>
	</section>

	<div class="side">
		<section class="player" bind:this={playerSection}>
			<CubePlayer {player}>
				{#snippet actions()}
					<button onclick={(): void => player.scramble()} data-testid="scramble">Scramble</button>
					<button class="primary" onclick={runChosen} title="Ctrl+Enter" data-testid="run"
						>Run</button
					>
					{#if program && (program.algos.length > 0 || program.lets.length > 0)}
						<select
							class="run-what"
							value={runWhat}
							onchange={(ev): void => {
								runChoice = ev.currentTarget.value;
							}}
							aria-label="What to run"
							data-testid="run-what"
						>
							{#if program.algos.length > 0}
								<optgroup label="Algos">
									{#each program.algos as algo, i (i)}
										<option
											value={algo.path.length === 1 && algo.def.name === 'main'
												? 'main'
												: `algo:${i}`}>{pathLabel(algo.path)}</option
										>
									{/each}
								</optgroup>
							{/if}
							{#if program.lets.length > 0}
								<optgroup label="Named Sequences">
									<option value="last">the last sequence</option>
									{#each program.lets as entry, i (i)}
										<option value="let:{i}">{pathLabel([...entry.path, entry.name])}</option>
									{/each}
								</optgroup>
							{/if}
						</select>
					{/if}
				{/snippet}
			</CubePlayer>
			<form class="play-line" onsubmit={playTyped}>
				<input
					bind:this={playInput}
					bind:value={playLine}
					placeholder="Moves to play: R U R' U', sune, F<R U>"
					aria-label="Moves to play"
					spellcheck="false"
					autocapitalize="off"
					autocomplete="off"
					data-testid="play-line"
				/>
				<button type="submit" data-testid="play">Play</button>
			</form>
			{#if playError}
				<p class="error" role="alert" data-testid="play-error">
					{playError.where}: {playError.message}
				</p>
			{/if}
		</section>

		<CurrentPermutation {player} />

		<MoveHistory {player} {showTrace}>
			{#snippet controls()}
				<label class="check"
					><input type="checkbox" bind:checked={showTrace} data-testid="show-trace" /> Show trace</label
				>
			{/snippet}
		</MoveHistory>
	</div>
</main>

<div class="library">
	<section class="card" data-testid="library">
		<h2>Library</h2>
		<p class="note">
			{persisted
				? 'Saved in this browser only.'
				: "This browser won't store the library: it's gone when the page closes."}
		</p>
		{#if programs.length === 0}
			<p class="note">Nothing saved yet.</p>
		{:else}
			<ul>
				{#each programs as p (p.name)}
					<li class:current={p.name === openName}>
						{#if renaming === p.name}
							<form class="rename" onsubmit={finishRename}>
								<input bind:value={newName} aria-label="New name" data-testid="rename-input" />
								<button type="submit">OK</button>
								<button
									type="button"
									onclick={(): void => {
										renaming = null;
									}}>Cancel</button
								>
							</form>
						{:else}
							<button class="open" onclick={(): void => open(p)} data-testid="open-{p.name}"
								>{p.name}</button
							>
							<span class="meta">{lines(p)} lines · {when(p.saved)}</span>
							<span class="actions">
								<button onclick={(): void => startRename(p)} data-testid="rename-{p.name}"
									>Rename</button
								>
								<button onclick={(): void => remove(p)} data-testid="delete-{p.name}">Delete</button
								>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card racing" data-testid="racing">
		<h2>Cube Racing</h2>
		<p class="note">
			A race runs a solver on {raceCount} random scrambles made from a seed (the same seed makes the same
			cubes), and counts the moves each solve takes, as the move history does. Your results are kept in
			this browser; the built-in ones come with the site.
		</p>
		<div class="race-bar">
			<select
				value={raceWhat}
				onchange={(ev): void => {
					raceChoice = ev.currentTarget.value;
				}}
				aria-label="What to race"
				disabled={racing !== null}
				data-testid="race-what"
			>
				{#each raceOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<label class="seed"
				>Seed <input
					type="number"
					step="1"
					bind:value={raceSeed}
					disabled={racing !== null}
					data-testid="race-seed"
				/></label
			>
			{#if racing}
				<button onclick={cancelRace} data-testid="race-cancel">Cancel</button>
				<span class="race-progress" data-testid="race-progress">
					<progress max={raceCount} value={raceProgress} aria-label="Cubes raced"></progress>
					{raceProgress} of {raceCount}
				</span>
			{:else}
				<button class="primary" bind:this={raceButton} onclick={startRacing} data-testid="race"
					>Race</button
				>
			{/if}
			{#if myRaces.length > 0}
				<button
					class="clear"
					onclick={clearRaces}
					disabled={racing !== null}
					data-testid="race-clear">Clear mine</button
				>
			{/if}
		</div>
		{#if raceError}<p class="error" role="alert" data-testid="race-error">{raceError}</p>{/if}
		<div role="status" aria-live="polite">
			{#if racing}<span class="visually-hidden">Racing: {raceProgress} of {raceCount} cubes</span
				>{/if}
			{#if raceStatus}<p class="status" data-testid="race-status">{raceStatus}</p>{/if}
		</div>

		<div class="race-table">
			<table data-testid="race-results">
				<thead>
					<tr>
						<th scope="col">Solver</th>
						<th scope="col">Seed</th>
						<th scope="col" class="num">Best</th>
						<th scope="col" class="num">Worst</th>
						<th scope="col" class="num">Average</th>
						<th scope="col" class="num">Median</th>
						<th scope="col" class="num">Unsolved</th>
						<th scope="col">Date</th>
					</tr>
				</thead>
				<tbody>
					{#each allRaces as result (raceKey(result))}
						{@const key = raceKey(result)}
						{@const unsolved = result.stats.count - result.stats.solved}
						<tr
							class:selected={shownRace !== undefined && raceKey(shownRace) === key}
							data-testid={result.builtIn ? 'race-built-in' : 'race-mine'}
						>
							<th scope="row">
								<button
									class="race-name"
									aria-pressed={shownRace !== undefined && raceKey(shownRace) === key}
									onclick={(): void => {
										selectedRace = key;
									}}
									title="Show its histogram">{result.name}</button
								>
								{#if result.builtIn}<span class="tag">built-in</span>{/if}
								{#if result.hash !== null}<span class="hash" title="Hash of the program's source"
										>#{result.hash}</span
									>{/if}
								{#if result.stopped !== undefined}<span
										class="tag stopped"
										title={result.stopped}
										data-testid="race-stopped">stopped early</span
									>{/if}
								{#if result.stats.count !== RACE_COUNT || result.stopped !== undefined}<span
										class="hash">{result.stats.count} cubes</span
									>{/if}
							</th>
							<td>{result.seed}</td>
							<td class="num">{stat(result.stats.best)}</td>
							<td class="num">{stat(result.stats.worst)}</td>
							<td class="num">{stat(result.stats.mean)}</td>
							<td class="num">{stat(result.stats.median)}</td>
							<td class="num">
								{#if unsolved === 0}
									<span class="none">0</span>
								{:else}
									<button
										class="unsolved"
										aria-expanded={failuresOf === key}
										title="List the cubes it didn't solve"
										onclick={(): void => {
											failuresOf = failuresOf === key ? null : key;
										}}
										data-testid="race-unsolved">{unsolved} {failuresOf === key ? '▾' : '▸'}</button
									>
								{/if}
							</td>
							<td class="date">{day(result.date)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if failedRace !== undefined}
			<div class="failures" data-testid="race-failures">
				<h3>
					<span>Unsolved: <strong>{failedRace.name}</strong>, seed {failedRace.seed}</span>
					<button
						class="close"
						onclick={(): void => {
							failuresOf = null;
						}}
						aria-label="Close the list">×</button
					>
				</h3>
				<ul>
					{#each failedRace.stats.failures as failure (failure.index)}
						<li>
							<span class="cube">Cube {failure.index + 1}</span>
							<span class="reason">{failure.reason}</span>
							{#if canLoadCubes(failedRace)}
								<button
									onclick={(): void => loadCube(failedRace, failure.index)}
									data-testid="load-cube">Load cube</button
								>
							{/if}
						</li>
					{/each}
				</ul>
				{#if failedRace.stats.count - failedRace.stats.solved > failedRace.stats.failures.length}
					<p class="note">
						and {failedRace.stats.count -
							failedRace.stats.solved -
							failedRace.stats.failures.length} more (only the first {failedRace.stats.failures
							.length} are kept)
					</p>
				{/if}
				{#if failedRace.stopped !== undefined}
					<p class="note">{failedRace.stopped}; the numbers are of the cubes raced.</p>
				{/if}
			</div>
		{/if}

		{#if shownRace !== undefined}
			<figure class="histogram" data-testid="race-histogram">
				<figcaption>
					Moves to solve: <strong>{shownRace.name}</strong>, seed {shownRace.seed}
					{#if shownRace.stats.meanQuarterTurns !== null}
						<span class="meta">· average {shownRace.stats.meanQuarterTurns} quarter turns</span>
					{/if}
				</figcaption>
				{#if shownBars.length === 0}
					<p class="note">No cube was solved.</p>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="bars"
						role="img"
						aria-label={histogramLabel}
						data-testid="race-bars"
						onmouseleave={(): void => {
							hoveredBar = null;
						}}
					>
						{#each shownBars as bar, i (bar.from)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="column"
								class:hovered={hoveredBar === i}
								data-testid="race-bar"
								onpointerenter={(): void => {
									hoveredBar = i;
								}}
								onpointerdown={(): void => {
									hoveredBar = i;
								}}
							>
								<div class="bar" style:height="{(bar.cubes / tallest) * 100}%"></div>
							</div>
						{/each}
						{#if hoveredBar !== null && hovered !== undefined}
							<div
								class="bar-tip"
								style:--at="{((hoveredBar + 0.5) / shownBars.length) * 100}%"
								data-testid="race-bar-tip"
							>
								{barText(hovered)}
							</div>
						{/if}
					</div>
					<div class="axis">
						<span>{shownBars[0]?.from}</span>
						<span>moves</span>
						<span>{(shownBars.at(-1)?.from ?? 0) + 4}</span>
					</div>
				{/if}
			</figure>
		{/if}
	</section>
</div>

<footer>
	<a href={resolve('/')}>Rubik's Cube Simulator</a> ·
	<a href="https://github.com/mckoss/cubing/blob/main/rubikon.md">About Rubikon</a>
</footer>

<style>
	header,
	main,
	.library,
	footer {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 1rem;
	}

	header {
		padding-top: 1.5rem;
	}

	h1 {
		margin: 0;
		font-size: clamp(1.6rem, 4vw, 2.4rem);
		letter-spacing: -0.02em;
	}

	.byline {
		margin: 0.25rem 0 1rem;
		color: var(--muted);
	}

	main {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}

	@media (max-width: 860px) {
		main {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	/* A sequence's label can be long: keep the toolbar within the screen. */
	.run-what {
		max-width: 14rem;
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.file-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	input:not([type='checkbox']) {
		font: inherit;
		font-size: 0.95rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		min-width: 0;
	}

	.name {
		flex: 1 1 8rem;
		font-weight: 600;
	}

	.dirty {
		color: var(--muted);
		font-size: 0.8rem;
		font-style: italic;
	}

	.pager {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.pager button {
		padding: 0.3rem 0.7rem;
	}

	.position {
		color: var(--muted);
		font-size: 0.85rem;
		min-width: 4.5em;
		text-align: center;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.code {
		display: flex;
		margin: 0.75rem 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		overflow: hidden;
		height: clamp(16rem, 55vh, 36rem);
	}

	.gutter,
	textarea {
		margin: 0;
		padding: 0.5rem;
		font-family: var(--mono);
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.gutter {
		flex: none;
		min-width: 2.5ch;
		overflow: hidden;
		color: var(--muted);
		text-align: right;
		user-select: none;
		border-right: 1px solid var(--border);
	}

	.gutter span {
		display: block;
		padding: 0 0.2rem;
	}

	.error-line {
		color: #fff;
		background: #c62828;
		border-radius: 3px;
	}

	textarea {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		resize: none;
		background: transparent;
		color: var(--text);
		white-space: pre;
		overflow: auto;
		tab-size: 2;
	}

	.check {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: var(--muted);
		font-size: 0.9rem;
	}

	.error {
		color: #c62828;
		font-size: 0.9rem;
		margin: 0.5rem 0;
		overflow-wrap: anywhere;
	}

	.where {
		padding: 0.05rem 0.4rem;
		margin-right: 0.35rem;
		font-family: var(--mono);
		font-size: 0.8rem;
		color: #c62828;
		border-color: #c62828;
	}

	.status {
		margin: 0.5rem 0;
		font-size: 0.9rem;
	}

	.note {
		color: var(--muted);
		font-size: 0.875rem;
		margin: 0.5rem 0;
	}

	code {
		font-family: var(--mono);
	}

	.lets {
		margin-top: 0.5rem;
	}

	summary {
		cursor: pointer;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.lets ul {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		max-height: 18rem;
		overflow-y: auto;
	}

	.lets li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.5rem;
		align-items: baseline;
		padding: 0.2rem 0;
		border-bottom: 1px solid var(--border);
	}

	.lets code {
		flex: 1 1 12rem;
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}

	.play {
		padding: 0.1rem 0.45rem;
		font-size: 0.75rem;
	}

	.let-name,
	.open {
		padding: 0;
		border: none;
		background: none;
		color: var(--accent);
		font-family: var(--mono);
		font-size: 0.85rem;
		text-align: left;
	}

	.path {
		color: var(--muted);
	}

	.let-name:hover,
	.open:hover {
		text-decoration: underline;
	}

	.play-line {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.play-line input {
		flex: 1;
		font-family: var(--mono);
	}

	h2 {
		margin: 0;
		font-size: 1.05rem;
	}

	.library {
		margin-top: 2rem;
	}

	.library ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.library li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: center;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
	}

	.library li.current .open {
		font-weight: 700;
	}

	.meta {
		color: var(--muted);
		font-size: 0.8rem;
	}

	.actions {
		display: flex;
		gap: 0.35rem;
		margin-left: auto;
	}

	.actions button,
	.rename button {
		padding: 0.2rem 0.6rem;
		font-size: 0.85rem;
	}

	.rename {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.racing {
		margin-top: 1.25rem;
	}

	.race-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin: 0.75rem 0;
	}

	.race-bar select {
		max-width: 100%;
		min-width: 0;
	}

	.seed {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: var(--muted);
		font-size: 0.9rem;
	}

	.seed input {
		width: 7rem;
	}

	.race-progress {
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
		color: var(--muted);
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}

	.race-bar .clear {
		margin-left: auto;
		padding: 0.3rem 0.7rem;
		font-size: 0.85rem;
	}

	/* The table scrolls sideways in its own box on a narrow screen. */
	.race-table {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	th,
	td {
		padding: 0.4rem 0.6rem;
		text-align: left;
		white-space: nowrap;
		border-bottom: 1px solid var(--border);
	}

	thead th {
		color: var(--muted);
		font-weight: 600;
		font-size: 0.8rem;
		background: var(--bg);
	}

	tbody th {
		font-weight: 400;
	}

	/* The solver stays in view while the numbers scroll sideways. */
	th:first-child {
		position: sticky;
		left: 0;
		background: var(--surface);
	}

	thead th:first-child {
		background: var(--bg);
	}

	tr.selected > * {
		background: color-mix(in srgb, var(--accent) 10%, var(--surface));
	}

	@media (max-width: 600px) {
		tbody th {
			min-width: 8rem;
			max-width: 10rem;
			white-space: normal;
		}
	}

	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.race-name {
		padding: 0;
		border: none;
		background: none;
		color: var(--accent);
		font-weight: 600;
		text-align: left;
	}

	.race-name:hover {
		text-decoration: underline;
	}

	.tag,
	.hash {
		margin-left: 0.4rem;
		color: var(--muted);
		font-size: 0.75rem;
	}

	.tag {
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: 999px;
	}

	.tag.stopped {
		color: #c62828;
		border-color: #c62828;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.hash {
		font-family: var(--mono);
	}

	.none,
	.date {
		color: var(--muted);
	}

	.unsolved {
		padding: 0.05rem 0.5rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: #fff;
		background: #c62828;
		border-color: #c62828;
	}

	.failures {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid #c62828;
		border-radius: 8px;
	}

	h3 {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin: 0 0 0.25rem;
		font-size: 0.9rem;
		font-weight: 400;
	}

	.failures .close {
		margin-left: auto;
		padding: 0 0.5rem;
		font-size: 1rem;
		line-height: 1.4;
	}

	.failures ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 16rem;
		overflow-y: auto;
	}

	.failures li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: center;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--border);
	}

	.failures li:last-child {
		border-bottom: none;
	}

	.failures .cube {
		font-weight: 600;
	}

	.failures .reason {
		flex: 1 1 12rem;
		color: #c62828;
		font-family: var(--mono);
		font-size: 0.8rem;
		overflow-wrap: anywhere;
	}

	.failures button {
		padding: 0.15rem 0.6rem;
		font-size: 0.8rem;
	}

	.histogram {
		margin: 1rem 0 0;
	}

	figcaption {
		font-size: 0.9rem;
		margin-bottom: 0.5rem;
	}

	.bars {
		position: relative;
		display: flex;
		align-items: flex-end;
		gap: 2px;
		/* The top band is room for the label of the bar pointed at. */
		height: 9rem;
		padding-top: 2rem;
		padding-bottom: 1px;
		box-sizing: border-box;
		border-bottom: 1px solid var(--border);
	}

	/* Each bar's column is its whole height, so short bars are easy to point at. */
	.column {
		flex: 1 1 0;
		min-width: 0;
		height: 100%;
		display: flex;
		align-items: flex-end;
	}

	.bar {
		width: 100%;
		background: var(--accent);
		border-radius: 2px 2px 0 0;
	}

	.column.hovered .bar {
		filter: brightness(0.8);
	}

	/* Above the bars, over the bar it describes, kept inside the chart. */
	.bar-tip {
		position: absolute;
		top: 0;
		--width: min(16rem, 100%);
		left: clamp(0px, calc(var(--at) - var(--width) / 2), calc(100% - var(--width)));
		width: var(--width);
		box-sizing: border-box;
		white-space: nowrap;
		text-align: center;
		pointer-events: none;
		padding: 0.2rem 0.4rem;
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 4px;
		box-shadow: 0 2px 6px rgb(0 0 0 / 0.15);
	}

	.axis {
		display: flex;
		justify-content: space-between;
		color: var(--muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	footer {
		padding: 2rem 1rem 3rem;
		color: var(--muted);
	}
</style>
