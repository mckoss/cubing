<script lang="ts">
	import { onMount } from 'svelte';
	import { Permutation } from '$lib/cube/permutation';
	import {
		apply2003,
		from2003Notation,
		parseMoves,
		simplifyMoves,
		permutationOf,
		to2003Notation,
		type Move,
		type MoveName
	} from '$lib/cube/moves';
	import { MoveList } from '$lib/cube/move-list';
	import { CATALOG } from '$lib/cube/catalog';
	import { SOLVERS } from '$lib/cube/solvers';
	import { SEQUENCES } from '$lib/cube/beginner';
	import { CubeView, SPEEDS, type Speed } from '$lib/cube/view';
	import HistoryBlock from '$lib/components/HistoryBlock.svelte';
	import TopCrossSteps from '$lib/components/TopCrossSteps.svelte';

	const moveList = new MoveList();
	let canvas: HTMLCanvasElement;
	let view: CubeView | undefined = $state();

	// The arrangement shown (updated as each move finishes turning).
	let perm = $state(new Permutation());
	// The move now turning (2003 notation), if any.
	let turning = $state('');
	// Bumped whenever the move list changes, to update the page.
	let version = $state(0);
	let speed: Speed = $state('Slow');
	let solverName = $state(SOLVERS[0].name);
	let showLabels = $state(true);
	let error = $state('');

	// Read `version` so these update when the move list changes.
	const history = $derived.by(() => {
		void version;
		return moveList.history();
	});
	const pendingCount = $derived.by(() => {
		void version;
		return moveList.pending.length;
	});
	const solved = $derived(perm.isIdentity());
	const idle = $derived(pendingCount === 0 && turning === '');

	$effect(() => {
		if (view) view.speed = speed;
	});
	$effect(() => {
		if (view) view.showLabels = showLabels;
	});

	let noWebGL = $state(false);

	onMount(() => {
		try {
			view = new CubeView(canvas);
		} catch (e) {
			// Without WebGL, moves still work; they just aren't drawn.
			console.warn(e);
			noWebGL = true;
		}
		void animate();
		return () => view?.dispose();
	});

	// Add moves (2003 notation), optionally as a named block.
	function play(moves: string, blockName?: string) {
		const block = blockName ? moveList.openBlock(blockName) : undefined;
		moveList.appendMoves(moves);
		block?.close();
		version++;
		void animate();
	}

	// Stepping through moves: when paused, only `steps` more moves are made.
	let stepThrough = $state(false);
	let paused = $state(false);
	let steps = 0;

	let animating = false;
	// Changed by Reset, so a move that was turning is dropped.
	let generation = 0;
	async function animate() {
		if (animating || (!view && !noWebGL)) return;
		animating = true;
		const current = generation;
		let ch: string | undefined;
		while (
			current === generation &&
			(!paused || steps > 0) &&
			(ch = moveList.nextMove()) !== undefined
		) {
			if (paused) steps--;
			turning = ch;
			version++;
			await view?.turn(from2003Notation(ch)[0]);
			if (current !== generation) break;
			perm = apply2003(perm, ch);
			turning = '';
		}
		animating = false;
		version++;
		// Moves may have been added after a reset.
		if (current !== generation) void animate();
	}

	// The arrangement once all queued moves are made.
	function finalPerm(): Permutation {
		return apply2003(apply2003(perm, turning), moveList.pending);
	}

	function move(name: MoveName, counterclockwise: boolean) {
		const m: Move = { name, turns: counterclockwise ? 3 : 1 };
		play(to2003Notation([m]));
	}

	// Scramble with 25 random face turns, never the same face twice in a row
	// (as in 2003).
	function scramble() {
		const faces = 'lrdubf';
		let moves = '';
		let last = -1;
		for (let i = 0; i < 25; i++) {
			let face: number;
			do {
				face = Math.floor(Math.random() * 6);
			} while (face === last);
			last = face;
			const ch = faces.charAt(face);
			moves += Math.random() < 0.5 ? ch.toUpperCase() : ch;
		}
		moveList.clear();
		paused = false;
		steps = 0;
		play(moves, 'Scramble');
	}

	// Where we are in the moves being played (for stepping through them),
	// counting a half turn as one move, as the history does.
	const stage = $derived.by(() => {
		void version;
		if (moveList.pending === '' && turning === '') return undefined;
		const position = moveList.played - turning.length;
		const block = moveList.blockAt(position);
		if (block === undefined) return undefined;
		const end = block.end ?? moveList.moves.length;
		const count = (from: number, to: number) =>
			simplifyMoves(from2003Notation(moveList.moves.substring(from, to))).length;
		return {
			name: block.name,
			move: count(block.start, position) + 1,
			of: count(block.start, end)
		};
	});

	function play_pause() {
		paused = !paused;
		steps = 0;
		void animate();
	}

	function nextMove() {
		paused = true;
		// A half turn is two letters in a row (e.g. "ff"): play both.
		const next = moveList.pending;
		steps = next.length >= 2 && next[0] === next[1] ? 2 : 1;
		void animate();
	}

	function nextStage() {
		paused = true;
		steps = moveList.nextBoundary(moveList.played) - moveList.played;
		void animate();
	}

	function solve() {
		error = '';
		paused = stepThrough;
		steps = 0;
		const solver = SOLVERS.find((s) => s.name === solverName)!;
		try {
			solver.solve(finalPerm(), moveList);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		version++;
		void animate();
	}

	function reset() {
		generation++;
		paused = false;
		steps = 0;
		moveList.clear();
		view?.reset();
		perm = new Permutation();
		turning = '';
		version++;
	}

	const KEYS: Record<string, MoveName> = {
		u: 'U',
		d: 'D',
		l: 'L',
		r: 'R',
		f: 'F',
		b: 'B',
		m: 'M',
		e: 'E',
		s: 'S',
		x: 'x',
		y: 'y',
		z: 'z'
	};

	function onKeydown(ev: KeyboardEvent) {
		const target = ev.target as HTMLElement;
		if (ev.ctrlKey || ev.metaKey || ev.altKey || target.closest('input, select, textarea')) {
			return;
		}
		const name = KEYS[ev.key.toLowerCase()];
		if (name !== undefined) {
			ev.preventDefault();
			move(name, ev.shiftKey);
		}
	}

	const PAD: { name: MoveName; label: string }[] = [
		{ name: 'U', label: 'Up face' },
		{ name: 'D', label: 'Down face' },
		{ name: 'L', label: 'Left face' },
		{ name: 'R', label: 'Right face' },
		{ name: 'F', label: 'Front face' },
		{ name: 'B', label: 'Back face' },
		{ name: 'M', label: 'Middle slice (turns like L)' },
		{ name: 'E', label: 'Equator slice (turns like D)' },
		{ name: 'S', label: 'Standing slice (turns like F)' },
		{ name: 'x', label: 'Turn the whole cube (like R)' },
		{ name: 'y', label: 'Turn the whole cube (like U)' },
		{ name: 'z', label: 'Turn the whole cube (like F)' }
	];

	const METHOD_STEPS: { title: string; text: string; sequences: [string, string][] }[] = [
		{
			title: 'First face',
			text: 'Solve the white face, with the edges and corners matching the centers around it. (My notes skip this step as obvious; the simulator uses the first layer of the Singmaster solution.) Then hold the white face down.',
			sequences: []
		},
		{
			title: 'Middle layer',
			text: 'Find an edge on top that belongs in the middle layer. Turn the top until its front color matches the front center, then move it down to the left or the right, where its top color matches. If an edge is in the middle layer but in the wrong place, insert any edge there to bring it to the top.',
			sequences: [
				['Down and to the left', SEQUENCES.insertLeft],
				['Down and to the right', SEQUENCES.insertRight]
			]
		},
		{
			title: 'Top cross',
			text: 'Make a cross of the top color (yellow) on top, one step at a time, with the same sequence each time. How you hold the cube matters: see the pictures below, which show the top face with the front edge at the bottom.',
			sequences: [['Next step toward the cross', SEQUENCES.topCross]]
		},
		{
			title: 'Top edges',
			text: 'Turn the top until two edges match their sides. If they are next to each other, hold them at the back and right, and swap the front and left edges. If they are across from each other, swap once from anywhere and try again.',
			sequences: [['Swap front and left edges', SEQUENCES.swapEdges]]
		},
		{
			title: 'Top corners',
			text: 'Find a corner in its place (it may be twisted), and cycle the other three around it. If no corner is in place, cycle any three first.',
			sequences: [
				['Cycle the corners, keeping the front right', SEQUENCES.cycleCorners],
				['Cycle them the other way, keeping the front left', SEQUENCES.cycleCornersBack]
			]
		},
		{
			title: 'Twist the corners',
			text: 'Hold a twisted corner at the front right, and twist it until its top color is on top. The bottom layer is scrambled along the way, but comes back once every corner is done. Then turn the top (not the whole cube) to bring the next twisted corner to the front right.',
			sequences: [
				['Twist one way', SEQUENCES.twistCorner],
				['Twist the other way', SEQUENCES.twistCornerBack]
			]
		}
	];

	const catalog = CATALOG.map((entry) => ({
		...entry,
		effect: permutationOf(entry.moves).toString()
	}));
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
	<title>Rubik's Cube Simulator</title>
	<meta
		name="description"
		content="A Rubik's Cube simulator and solver, first written in 2003 and rebuilt with Three.js and Svelte."
	/>
</svelte:head>

<header>
	<h1>Rubik's Cube Simulator</h1>
	<p class="byline">by <a href="https://mckoss.com">Mike Koss</a> · 2003, rebuilt in 2026</p>
</header>

<main>
	<section class="stage">
		<div class="canvas-wrap">
			<canvas bind:this={canvas} aria-label="Rubik's Cube" data-testid="cube"></canvas>
			{#if noWebGL}
				<p class="no-webgl">This browser can't show the cube in 3D (WebGL is off).</p>
			{/if}
			{#if solved && idle}
				<span class="badge" data-testid="solved">Solved</span>
			{/if}
		</div>

		<div class="toolbar">
			<button class="primary" onclick={scramble} data-testid="scramble">Scramble</button>
			<div class="solve">
				<button class="primary" onclick={solve} data-testid="solve">Solve</button>
				{#if SOLVERS.length > 1}
					<select bind:value={solverName} aria-label="Solver">
						{#each SOLVERS as s (s.name)}<option>{s.name}</option>{/each}
					</select>
				{/if}
			</div>
			<button onclick={() => view?.flip()} title="Turn the view upside down" data-testid="flip"
				>Flip</button
			>
			<button onclick={reset} data-testid="reset">Reset</button>
			<div class="speed" role="group" aria-label="Speed">
				{#each Object.keys(SPEEDS) as s (s)}
					<button
						class:selected={speed === s}
						aria-pressed={speed === s}
						onclick={() => (speed = s as Speed)}>{s}</button
					>
				{/each}
			</div>
			<label class="labels"><input type="checkbox" bind:checked={showLabels} /> Labels</label>
		</div>
		<div class="stepper">
			<label
				><input type="checkbox" bind:checked={stepThrough} data-testid="step-through" /> Step through
				solutions</label
			>
			{#if pendingCount > 0 || turning}
				<button onclick={play_pause} data-testid="play-pause">{paused ? 'Play' : 'Pause'}</button>
				<button onclick={nextMove} data-testid="next-move">Next move</button>
				<button onclick={nextStage} data-testid="next-stage">Next stage</button>
				{#if stage}
					<span class="stage" data-testid="stage"
						>{stage.name}: move {stage.move} of {stage.of}</span
					>
				{/if}
			{/if}
		</div>
		<p class="hint">Drag to turn the cube around, and scroll to zoom.</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</section>

	<aside>
		<section class="card">
			<h2>Moves</h2>
			<p class="note">
				Click a move or type its letter. For counterclockwise, use the ′ button or hold <kbd
					>Shift</kbd
				>.
			</p>
			<div class="pad">
				{#each PAD as { name, label } (name)}
					<div class="pair" title={label}>
						<button onclick={() => move(name, false)} data-testid="move-{name}">{name}</button>
						<button onclick={() => move(name, true)} data-testid="move-{name}-prime">{name}′</button
						>
					</div>
				{/each}
			</div>
		</section>

		<section class="card">
			<h2>Current Permutation</h2>
			<p class="perm" data-testid="permutation">{solved ? 'Solved' : perm.toString()}</p>
		</section>

		<section class="card history">
			<h2>
				History
				{#if pendingCount > 0}<span class="pending">{pendingCount} to go</span>{/if}
			</h2>
			<div data-testid="history">
				{#each history as block, i (i)}
					<HistoryBlock {block} />
				{:else}
					<p class="note">No moves yet.</p>
				{/each}
			</div>
		</section>
	</aside>
</main>

<section class="catalog">
	<h2>Move Catalog</h2>
	<p class="note">
		Sequences from my 2003 notes, labeled as in David Singmaster's <cite
			>Notes on Rubik's Magic Cube</cite
		>. The simulator computes the effect of each in cycle notation: <code>(UF UR UB)</code> moves
		the piece at UF to UR, the one at UR to UB, and the one at UB back to UF. A <code>+</code> or
		<code>-</code> after a cycle means its pieces come back twisted or flipped.
	</p>
	<div class="table-wrap">
		<table>
			<thead>
				<tr><th>Label</th><th>Moves</th><th>Effect</th><th></th></tr>
			</thead>
			<tbody>
				{#each catalog as entry (entry.original)}
					<tr>
						<td>{entry.label}</td>
						<td>
							<span class="mono">{entry.notation}</span>
							<span class="original">2003: {entry.original}</span>
						</td>
						<td class="mono effect">{entry.effect}</td>
						<td>
							<button
								onclick={() => play(entry.original, `Try It: ${entry.label || entry.notation}`)}
								>Try it</button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<section class="method" data-testid="method">
	<h2>The Basic Modern Solution</h2>
	<p>
		This is the simple, basic modern solution, the layer-by-layer method most people learn today. I
		didn't invent it; it's the one I learned and use to solve a cube by hand. With normal manual
		dexterity, it solves a cube in about two minutes. Choose <em>Basic Modern Solution</em> next to the
		Solve button to watch the simulator solve the cube this way; it follows the same kind of rules as
		the 2003 Singmaster solver.
	</p>
	<ol>
		{#each METHOD_STEPS as step (step.title)}
			<li>
				<h3>{step.title}</h3>
				<p>{step.text}</p>
				{#each step.sequences as [label, moves] (moves)}
					<div class="sequence">
						<span>{label}:</span>
						<code>{moves}</code>
						<button onclick={() => play(to2003Notation(parseMoves(moves)), `Try It: ${label}`)}
							>Try it</button
						>
					</div>
				{/each}
				{#if step.title === 'Top cross'}
					<TopCrossSteps sequence={SEQUENCES.topCross} />
				{/if}
			</li>
		{/each}
	</ol>
	<figure>
		<enhanced:img
			src="$lib/assets/basic-solution.png?w=1040;520&grayscale&normalize"
			sizes="(min-width: 560px) 520px, 100vw"
			alt="Mike's handwritten notes: the middle layer, top cross, top edges, top corners, and corner twists, with a sketch and sequence for each."
			loading="lazy"
		/>
		<figcaption>Exhibit: my handwritten notes on the method.</figcaption>
	</figure>
</section>

<section class="notes">
	<h2>Notes</h2>
	<p>
		I wrote the first version of this simulator in April 2003, using the WildTangent 3D browser
		plugin (long gone). Its solver is from <cite>Notes on Rubik's Magic Cube</cite> by David Singmaster;
		I have a copy of the book from 1981 (US edition). The solution isn't the most efficient known, taking
		well over 100 moves, but it proceeds in layers, much as a person would:
	</p>
	<ul>
		<li>First the top layer is solved.</li>
		<li>The cube is turned over, then the middle layer is solved.</li>
		<li>Finally the Down (now Up) layer is solved.</li>
	</ul>
	<p>
		I also started a second solver, based on the method Frank Lee taught me, to compare the two, but
		never finished it.
	</p>
	<p>
		In 2026 the simulator was rebuilt with <a href="https://threejs.org">Three.js</a> and
		<a href="https://svelte.dev">Svelte</a>, with help from Claude. The permutation code and the
		Singmaster solver are ported from the 2003 JavaScript and make exactly the same moves, now shown
		in standard notation. The simulator also keeps track of the centers, so slice moves (M, E, S)
		can be solved too.
	</p>
</section>

<footer>
	<a href="https://github.com/mckoss/cubing">Source on GitHub</a>
</footer>

<style>
	:global(:root) {
		--bg: #f6f7f9;
		--surface: #ffffff;
		--text: #1d2330;
		--muted: #5f6b7d;
		--border: #dde2ea;
		--accent: #356eef;
		--accent-text: #ffffff;
		--stage: radial-gradient(circle at 50% 35%, #3b2a8f 0%, #1c1150 55%, #0e0930 100%);
		--mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		color-scheme: light dark;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root) {
			--bg: #0f1218;
			--surface: #171b24;
			--text: #e6e9ef;
			--muted: #98a2b3;
			--border: #2a3140;
			--accent: #5b8cff;
		}
	}

	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font:
			16px/1.5 system-ui,
			-apple-system,
			'Segoe UI',
			sans-serif;
	}

	:global(a) {
		color: var(--accent);
	}

	header,
	main,
	.catalog,
	.notes,
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
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: 1.25rem;
		align-items: start;
	}

	@media (max-width: 860px) {
		main {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.canvas-wrap {
		position: relative;
		aspect-ratio: 1;
		border-radius: 16px;
		overflow: hidden;
		background: var(--stage);
		box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
		outline: none;
	}

	.no-webgl {
		position: absolute;
		inset: 40% 1rem auto;
		margin: 0;
		color: white;
		text-align: center;
	}

	.badge {
		position: absolute;
		top: 12px;
		left: 12px;
		padding: 0.2rem 0.7rem;
		border-radius: 999px;
		background: rgb(57 166 59 / 0.9);
		color: white;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.75rem;
	}

	.solve {
		display: flex;
		gap: 0.25rem;
	}

	button,
	select {
		font: inherit;
		font-size: 0.95rem;
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
	}

	button:hover {
		border-color: var(--accent);
	}

	button:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}

	.speed {
		display: inline-flex;
	}

	.speed button {
		border-radius: 0;
		margin-left: -1px;
	}

	.speed button:first-child {
		border-radius: 8px 0 0 8px;
	}

	.speed button:last-child {
		border-radius: 0 8px 8px 0;
	}

	.speed button.selected {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}

	.stepper {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		min-height: 2.4rem;
		margin-top: 0.5rem;
	}

	.stepper label {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: var(--muted);
		font-size: 0.95rem;
	}

	.stage {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.labels {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: var(--muted);
		font-size: 0.95rem;
	}

	.hint,
	.note {
		color: var(--muted);
		font-size: 0.875rem;
		margin: 0.5rem 0;
	}

	.error {
		color: #c62828;
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 0.9rem 1rem;
	}

	h2 {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		margin: 0 0 0.5rem;
		font-size: 1.05rem;
	}

	.pending {
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 400;
	}

	.pad {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.pair {
		display: flex;
	}

	.pair button {
		flex: 1;
		padding: 0.45rem 0;
		font-family: var(--mono);
		font-weight: 600;
		border-radius: 0;
	}

	.pair button:first-child {
		border-radius: 8px 0 0 8px;
	}

	.pair button:last-child {
		border-radius: 0 8px 8px 0;
		margin-left: -1px;
	}

	.perm {
		margin: 0;
		font-family: var(--mono);
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}

	.history div {
		max-height: 22rem;
		overflow-y: auto;
	}

	kbd {
		padding: 0 0.3rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.catalog,
	.method,
	.notes {
		margin-top: 2rem;
	}

	.method {
		max-width: 1200px;
		margin-left: auto;
		margin-right: auto;
		padding: 0 1rem;
	}

	.method ol {
		padding-left: 1.25rem;
	}

	.method h3 {
		margin: 1rem 0 0.25rem;
		font-size: 1rem;
	}

	.method p {
		margin: 0 0 0.5rem;
	}

	.sequence {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: center;
		margin: 0.25rem 0;
	}

	.sequence code {
		padding: 0.1rem 0.4rem;
		border-radius: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
	}

	.sequence button {
		padding: 0.2rem 0.6rem;
		font-size: 0.85rem;
	}

	figure {
		margin: 1.5rem 0 0;
	}

	figure :global(img) {
		display: block;
		max-width: min(100%, 520px);
		height: auto;
		border-radius: 8px;
		border: 1px solid var(--border);
	}

	figcaption {
		margin-top: 0.4rem;
		color: var(--muted);
		font-size: 0.875rem;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th,
	td {
		padding: 0.45rem 0.6rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}

	th {
		color: var(--muted);
		font-weight: 600;
	}

	.mono,
	code {
		font-family: var(--mono);
	}

	.original {
		display: block;
		color: var(--muted);
		font-family: var(--mono);
		font-size: 0.8rem;
	}

	.effect {
		min-width: 14rem;
	}

	td button {
		padding: 0.25rem 0.6rem;
		font-size: 0.85rem;
		white-space: nowrap;
	}

	footer {
		padding: 2rem 1rem 3rem;
		color: var(--muted);
	}
</style>
