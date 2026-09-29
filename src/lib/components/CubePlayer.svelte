<script lang="ts">
	// The cube, with the controls for playing moves on it: speed, flip,
	// reset, labels, and stepping through.  `actions` go first in the
	// toolbar (a page's own buttons, like Scramble and Solve).
	import { onMount, type Snippet } from 'svelte';
	import { SPEED_NAMES } from '$lib/cube/view';
	import type { Player } from '$lib/cube/player.svelte';

	let {
		player,
		actions,
		stepLabel = 'Step through'
	}: { player: Player; actions?: Snippet; stepLabel?: string } = $props();

	let canvas: HTMLCanvasElement;

	onMount(() => player.attach(canvas));

	$effect(() => {
		if (player.view) player.view.speed = player.speed;
	});
	$effect(() => {
		if (player.view) player.view.showLabels = player.showLabels;
	});
</script>

<div class="canvas-wrap">
	<canvas bind:this={canvas} aria-label="Rubik's Cube" data-testid="cube"></canvas>
	{#if player.noWebGL}
		<p class="no-webgl">This browser can't show the cube in 3D (WebGL is off).</p>
	{/if}
	{#if player.solved && player.idle}
		<span class="badge" data-testid="solved">Solved</span>
	{/if}
</div>

<div class="toolbar">
	{@render actions?.()}
	<button
		onclick={(): void => player.view?.flip()}
		title="Turn the view upside down"
		data-testid="flip">Flip</button
	>
	<button onclick={(): void => player.reset()} data-testid="reset">Reset</button>
	<div class="speed" role="group" aria-label="Speed">
		{#each SPEED_NAMES as s (s)}
			<button
				class:selected={player.speed === s}
				aria-pressed={player.speed === s}
				onclick={(): void => {
					player.speed = s;
				}}>{s}</button
			>
		{/each}
	</div>
	<label class="labels"><input type="checkbox" bind:checked={player.showLabels} /> Labels</label>
</div>
<div class="stepper">
	<label
		><input type="checkbox" bind:checked={player.stepThrough} data-testid="step-through" />
		{stepLabel}</label
	>
	{#if player.pendingCount > 0 || player.turning}
		<button onclick={(): void => player.playPause()} data-testid="play-pause"
			>{player.paused ? 'Play' : 'Pause'}</button
		>
		<button onclick={(): void => player.nextMove()} data-testid="next-move">Next move</button>
		<button onclick={(): void => player.nextAlgo()} data-testid="next-algo">Next algo</button>
		{#if player.stage}
			<span class="stage" data-testid="stage"
				>{player.stage.name}: move {player.stage.move} of {player.stage.of}</span
			>
		{/if}
	{/if}
</div>
<p class="hint">Drag to turn the cube around, and scroll to zoom.</p>

<style>
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

	.hint {
		color: var(--muted);
		font-size: 0.875rem;
		margin: 0.5rem 0;
	}
</style>
