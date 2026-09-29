<script lang="ts">
	import type { HistoryBlock } from '$lib/cube/move-list';
	import { formatMoves } from '$lib/cube/moves';
	import Self from './HistoryBlock.svelte';

	// showTrace: whether to show Rubikon trace() lines.
	let {
		block,
		depth = 0,
		showTrace = true
	}: { block: HistoryBlock; depth?: number; showTrace?: boolean } = $props();

	const count = $derived(
		block.quarterTurns === block.faceTurns
			? `${block.faceTurns} moves`
			: `${block.faceTurns} moves · ${block.quarterTurns} quarter turns`
	);
</script>

<section class="block" class:nested={depth > 0} data-block={block.name}>
	<h4>
		{block.name}
		<span class="count">{count}</span>
	</h4>
	{#each block.items as item, i (i)}
		{#if Array.isArray(item)}
			<p class="moves">{formatMoves(item)}</p>
		{:else if 'note' in item}
			{#if item.note !== 'trace' || showTrace}
				<p class="note {item.note}" data-note={item.note}>{item.text}</p>
			{/if}
		{:else}
			<Self block={item} depth={depth + 1} {showTrace} />
		{/if}
	{/each}
</section>

<style>
	.block {
		margin: 0 0 0.5rem;
	}

	.nested {
		padding-left: 0.75rem;
		border-left: 2px solid var(--border);
	}

	h4 {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		align-items: baseline;
		margin: 0 0 0.25rem;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.count {
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 400;
	}

	.moves {
		margin: 0 0 0.35rem;
		font-family: var(--mono);
		font-size: 0.85rem;
		line-height: 1.6;
		word-spacing: 0.2rem;
	}

	.note {
		margin: 0 0 0.35rem;
		color: var(--muted);
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}

	.trace {
		font-family: var(--mono);
		white-space: pre-wrap;
	}

	.bypass {
		font-style: italic;
	}
</style>
