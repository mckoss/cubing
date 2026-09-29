<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { Player } from '$lib/cube/player.svelte';
	import CubePlayer from '$lib/components/CubePlayer.svelte';
	import MoveHistory from '$lib/components/MoveHistory.svelte';
	import { formatTaggedMoves } from '$lib/rubikon/moves';
	import { applyEvents } from '$lib/rubikon/record';
	import type { RunEvent } from '$lib/rubikon/events';
	import { Library, browserStorage, type Program } from '$lib/rubikon/library';
	import {
		ProgramError,
		evaluateMovesLine,
		evaluateProgram,
		playEvents,
		type EvaluatedProgram,
		type LetEntry
	} from '$lib/rubikon/playground';
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
	const index = $derived(programs.findIndex((p) => p.name === openName));

	let program: EvaluatedProgram | undefined = $state();
	let error: ProgramError | undefined = $state();
	let status = $state('');
	// Which let Run plays (by index in program.lets); -1 for the last.
	let runLet = $state(-1);
	let playLine = $state('');
	let playError: ProgramError | undefined = $state();
	let showTrace = $state(true);
	let fromSolved = $state(true);

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
			if (runLet >= program.lets.length) runLet = -1;
		} catch (e) {
			program = undefined;
			error = showError(e);
			void jumpTo(error);
		}
		return program;
	}

	// Record a run's events on the player, and play them.
	function run(events: RunEvent[]): void {
		if (fromSolved) {
			player.reset();
		}
		player.startSolution();
		applyEvents(events, player.moveList);
		player.changed();
	}

	function play(entry: LetEntry): void {
		run(playEvents(entry.name, entry.moves, entry.loc));
		status = `Played ${entry.name}: ${entry.moves.length} moves.`;
	}

	// Run: evaluate the program, and play the chosen let (the last one, if
	// none was chosen).  With the runtime, this will run the program.
	function runProgram(): void {
		status = '';
		const evaluated = evaluate();
		if (evaluated === undefined) return;
		const entry = evaluated.lets.at(runLet);
		if (entry === undefined) {
			status = 'Nothing to play yet: add a let, or type moves below.';
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
			runProgram();
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

	function open(p: Program): void {
		if (p.name === openName || !mayLeave()) return;
		openName = p.name;
		name = p.name;
		source = p.source;
		library.lastOpen = p.name;
		program = undefined;
		error = undefined;
		runLet = -1;
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
		status = `Saved ${saved.name}.`;
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

	function letLabel(entry: LetEntry): string {
		return [...entry.path, entry.name].join(' › ');
	}
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
	<h1>Rubikon Playground</h1>
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

		<div class="run-bar">
			<button class="primary" onclick={runProgram} title="Ctrl+Enter" data-testid="run">Run</button>
			{#if program && program.lets.length > 0}
				<select bind:value={runLet} aria-label="Let to play" data-testid="run-let">
					<option value={-1}>the last let</option>
					{#each program.lets as entry, i (i)}
						<option value={i}>{letLabel(entry)}</option>
					{/each}
				</select>
			{/if}
			<label class="check"><input type="checkbox" bind:checked={fromSolved} /> From solved</label>
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
				<summary>Lets ({program.lets.length})</summary>
				{#if program.lets.length === 0}
					<p class="note">No lets to play.</p>
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
			Run evaluates the program and plays a let; the rest (<code>do</code>, algos, searches) waits
			for the runtime. Imports come from the library, by name.
		</p>
	</section>

	<div class="side">
		<section class="player">
			<CubePlayer {player} />
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
		<p class="note">Saved in this browser only.</p>
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
</div>

<footer>
	<a href={resolve('/')}>Rubik's Cube Simulator</a> ·
	<a href="https://github.com/mckoss/cubing/blob/main/LANGUAGE.md">About Rubikon</a>
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

	.side {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.file-bar,
	.run-bar {
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

	footer {
		padding: 2rem 1rem 3rem;
		color: var(--muted);
	}
</style>
