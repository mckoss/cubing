<script lang="ts">
	import { VERSION } from '$lib/version';
	import { resolve } from '$app/paths';
	import { formatMoves, permutationOf } from '$lib/cube/moves';
	import type { Move, MoveName } from '$lib/cube/types';
	import { CATALOG, type CatalogEntry } from '$lib/cube/catalog';
	import { SOLVERS } from '$lib/cube/solvers';
	import { SEQUENCES } from '$lib/cube/beginner';
	import { Player } from '$lib/cube/player.svelte';
	import CubePlayer from '$lib/components/CubePlayer.svelte';
	import MoveHistory from '$lib/components/MoveHistory.svelte';
	import TopCrossSteps from '$lib/components/TopCrossSteps.svelte';
	import CaseDiagram, { type Case } from '$lib/components/CaseDiagram.svelte';

	const player = new Player();
	let solverName: string = $state(SOLVERS[0]?.name ?? '');
	let error: string = $state('');

	function solve(): void {
		const solver = SOLVERS.find((s) => s.name === solverName);
		if (solver === undefined) {
			error = `Unknown solver: ${solverName}`;
			return;
		}
		error = '';
		player.startSolution();
		try {
			solver.solve(player.finalPerm(), player.moveList);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
		player.changed();
	}

	const PAD: readonly { name: MoveName; label: string }[] = [
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

	interface MethodSequence {
		label: string;
		moves: Move[];
		// A picture of what to look for (see CaseDiagram), and a caption.
		diagram?: Case;
		look?: string;
	}

	interface MethodStep {
		title: string;
		text: string;
		sequences: MethodSequence[];
	}

	const METHOD_STEPS: readonly MethodStep[] = [
		{
			title: 'First face',
			text: 'Hold the white face down, and solve it with the edges and corners matching the centers around it. (My notes skip this step as obvious.) Find a white piece on top, turn the top until it is over its place, and put it down: the edges first, then the corners. A white piece on the bottom in the wrong place, or in the middle layer, goes up to the top first.',
			sequences: []
		},
		{
			title: 'Middle layer',
			text: 'Find an edge on top that belongs in the middle layer. Turn the top until its front color matches the front center, then move it down to the left or the right, where its top color matches. If an edge is in the middle layer but in the wrong place, insert any edge there to bring it to the top.',
			sequences: [
				{
					label: 'Down and to the left',
					moves: SEQUENCES.insertLeft,
					diagram: 'middle-left',
					look: 'The top edge is blue in front, like the front center, and red on top, like the left center.'
				},
				{
					label: 'Down and to the right',
					moves: SEQUENCES.insertRight,
					diagram: 'middle-right',
					look: 'The top edge is blue in front, and orange on top, like the right center.'
				}
			]
		},
		{
			title: 'Top cross',
			text: 'Make a cross of the top color (yellow) on top, one step at a time, with the same sequence each time. How you hold the cube matters, as the pictures show.',
			sequences: [{ label: 'Next step toward the cross', moves: SEQUENCES.topCross }]
		},
		{
			title: 'Top edges',
			text: 'Turn the top until two edges match their sides. If they are next to each other, hold them at the back and right, and swap the front and left edges. If they are across from each other, swap once from anywhere and try again.',
			sequences: [
				{
					label: 'Swap the front and left edges',
					moves: SEQUENCES.swapEdges,
					diagram: 'swap-edges',
					look: 'The back and right edges match their sides; the front and left edges are swapped.'
				}
			]
		},
		{
			title: 'Top corners',
			text: 'Find a corner in its place (it may be twisted), and cycle the other three around it. If no corner is in place, cycle any three first.',
			sequences: [
				{
					label: 'Cycle the corners, keeping the front right',
					moves: SEQUENCES.cycleCorners,
					diagram: 'corners',
					look: 'The front right corner is in place. The others go back right to back left, to front left, and back to back right.'
				},
				{
					label: 'Cycle them the other way, keeping the front left',
					moves: SEQUENCES.cycleCornersBack,
					diagram: 'corners-back',
					look: 'The front left corner is in place. The others go back left to back right, to front right, and back to back left.'
				}
			]
		},
		{
			title: 'Twist the corners',
			text: "Hold a twisted corner at the front right, and repeat the sequence for the way its yellow sticker faces until it's on top. The bottom layer is scrambled along the way, but comes back once every corner is done. Then turn the top (not the whole cube) to bring the next twisted corner to the front right.",
			sequences: [
				{
					label: 'Yellow facing right',
					moves: SEQUENCES.twistCorner,
					diagram: 'twist',
					look: "The front right corner's yellow sticker faces right. (Another corner is twisted the other way: one corner can't be twisted alone.)"
				},
				{
					label: 'Yellow facing front',
					moves: SEQUENCES.twistCornerBack,
					diagram: 'twist-back',
					look: "The front right corner's yellow sticker faces front. (Another corner is twisted the other way.)"
				}
			]
		}
	];

	const catalog = CATALOG.map((entry): CatalogEntry & { effect: string } => ({
		...entry,
		effect: permutationOf(entry.moves).toString()
	}));
</script>

<svelte:window onkeydown={(ev): void => player.keydown(ev)} />

<svelte:head>
	<title>Rubik's Cube Simulator</title>
	<meta
		name="description"
		content="A Rubik's Cube simulator and solver, first written in 2003 and rebuilt with Three.js and Svelte."
	/>
</svelte:head>

<header>
	<h1>Rubik's Cube Simulator <small class="version" data-testid="version">v{VERSION}</small></h1>
	<p class="byline">
		by <a href="https://mckoss.com">Mike Koss</a> · 2003, rebuilt in 2026 ·
		<a href={resolve('/playground')}>Rubikon Playground</a>
	</p>
</header>

<main>
	<section class="stage">
		<CubePlayer {player} stepLabel="Step through solutions">
			{#snippet actions()}
				<button class="primary" onclick={(): void => player.scramble()} data-testid="scramble"
					>Scramble</button
				>
				<div class="solve">
					<button class="primary" onclick={solve} data-testid="solve">Solve</button>
					{#if SOLVERS.length > 1}
						<select bind:value={solverName} aria-label="Solver">
							{#each SOLVERS as s (s.name)}<option>{s.name}</option>{/each}
						</select>
					{/if}
				</div>
			{/snippet}
		</CubePlayer>
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
						<button onclick={(): void => player.move(name, false)} data-testid="move-{name}"
							>{name}</button
						>
						<button onclick={(): void => player.move(name, true)} data-testid="move-{name}-prime"
							>{name}′</button
						>
					</div>
				{/each}
			</div>
		</section>

		<section class="card">
			<h2>Current Permutation</h2>
			<p class="perm" data-testid="permutation">
				{player.solved ? 'Solved' : player.perm.toString()}
			</p>
		</section>

		<MoveHistory {player} />
	</aside>
</main>

<section class="catalog">
	<h2>Move Catalog</h2>
	<p class="note">
		Sequences from my 2003 notes, labeled as in David Singmaster's <cite
			>Notes on Rubik's Magic Cube</cite
		>. The simulator computes the effect of each in cycle notation: <code>(uf ur ub)</code> moves
		the piece at uf to ur, the one at ur to ub, and the one at ub back to uf. Pieces are named in
		lower case, as Singmaster did, so they aren't mistaken for moves. A <code>+</code> or
		<code>-</code> after a cycle means its pieces come back twisted or flipped.
	</p>
	<div class="table-wrap">
		<table>
			<thead>
				<tr><th>Label</th><th>Moves</th><th>Effect</th><th></th></tr>
			</thead>
			<tbody>
				{#each catalog as entry (entry.notation)}
					<tr>
						<td>{entry.label}</td>
						<td>
							<span class="mono">{entry.notation}</span>
						</td>
						<td class="mono effect">{entry.effect}</td>
						<td>
							<button
								onclick={(): void =>
									player.play(entry.moves, `Try It: ${entry.label || entry.notation}`)}
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
				{#each step.sequences as { label, moves, diagram, look } (label)}
					<div class="sequence" class:with-diagram={diagram}>
						{#if diagram}
							<CaseDiagram kind={diagram} label={look ?? label} />
						{/if}
						<div class="sequence-text">
							<span class="sequence-label">{label}:</span>
							{#if look}<span class="look">{look}</span>{/if}
							<span class="sequence-moves">
								<code>{formatMoves(moves)}</code>
								<button onclick={(): void => player.play(moves, `Try It: ${label}`)}>Try it</button>
							</span>
						</div>
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

	.solve {
		display: flex;
		gap: 0.25rem;
	}

	.note {
		color: var(--muted);
		font-size: 0.875rem;
		margin: 0.5rem 0;
	}

	.error {
		color: #c62828;
		font-size: 0.9rem;
	}

	aside {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h2 {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		margin: 0 0 0.5rem;
		font-size: 1.05rem;
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

	.sequence.with-diagram {
		flex-wrap: nowrap;
		margin: 0.75rem 0;
	}

	.sequence-text {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: center;
	}

	.with-diagram .sequence-text {
		flex-direction: column;
		align-items: flex-start;
	}

	.sequence-label {
		font-weight: 600;
	}

	.look {
		color: var(--muted);
		font-size: 0.9rem;
	}

	.sequence-moves {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: center;
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
