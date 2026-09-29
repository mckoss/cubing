<script lang="ts">
	// The move history card: the player's moves, grouped in blocks.
	// `controls` go in the heading (e.g. a checkbox for trace lines).
	import type { Snippet } from 'svelte';
	import type { Player } from '$lib/cube/player.svelte';
	import HistoryBlock from './HistoryBlock.svelte';

	let {
		player,
		showTrace = true,
		controls
	}: { player: Player; showTrace?: boolean; controls?: Snippet } = $props();
</script>

<section class="card history">
	<h2>
		History
		{#if player.pendingCount > 0}<span class="pending">{player.pendingCount} to go</span>{/if}
		{#if controls}<span class="controls">{@render controls()}</span>{/if}
	</h2>
	<div data-testid="history">
		{#each player.history as block, i (i)}
			<HistoryBlock {block} {showTrace} />
		{:else}
			<p class="note">No moves yet.</p>
		{/each}
	</div>
</section>

<style>
	h2 {
		display: flex;
		flex-wrap: wrap;
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

	.controls {
		margin-left: auto;
		font-size: 0.875rem;
		font-weight: 400;
	}

	.note {
		color: var(--muted);
		font-size: 0.875rem;
		margin: 0.5rem 0;
	}

	.history div {
		max-height: 22rem;
		overflow-y: auto;
	}
</style>
