<script lang="ts">
	import {
		blockState,
		moveState,
		noteState,
		type HistoryBlock,
		type Playhead
	} from '$lib/cube/move-list';
	import { countOf, formatMove } from '$lib/cube/moves';
	import Self from './HistoryBlock.svelte';

	// showTrace: whether to show Rubikon trace() lines.  head: where
	// playback is; moves and notes not yet played are dimmed, and the move
	// now playing, and the blocks containing it, are marked.
	let {
		block,
		head,
		depth = 0,
		showTrace = true
	}: { block: HistoryBlock; head: Playhead; depth?: number; showTrace?: boolean } = $props();

	// The whole history always contains the move playing: only the blocks
	// inside it are marked.
	const progress = $derived.by(() => {
		const state = blockState(block, head);
		return depth === 0 && state === 'current' ? 'played' : state;
	});

	const count = $derived(
		block.quarterTurns === block.faceTurns
			? countOf(block.faceTurns, 'move')
			: `${countOf(block.faceTurns, 'move')} · ${countOf(block.quarterTurns, 'quarter turn')}`
	);
</script>

<section class="block {progress}" class:nested={depth > 0} data-block={block.name}>
	<h4>
		{block.name}
		<span class="count">{count}</span>
	</h4>
	{#each block.items as item, i (i)}
		{#if Array.isArray(item)}
			<p class="moves">
				{#each item as move, j (j)}{@const moveAt = moveState(move, head)}{j > 0 ? ' ' : ''}<span
						class="move {moveAt}"
						aria-current={moveAt === 'current' ? 'step' : undefined}>{formatMove(move)}</span
					>{/each}
			</p>
		{:else if 'note' in item}
			{#if item.note !== 'trace' || showTrace}
				<p class="note {item.note} {noteState(item, head)}" data-note={item.note}>{item.text}</p>
			{/if}
		{:else}
			<Self block={item} {head} depth={depth + 1} {showTrace} />
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

	/* The blocks containing the move now playing. */
	.nested.current {
		border-left-color: var(--accent);
	}

	.current > h4 {
		color: var(--accent);
	}

	.ahead > h4,
	.move.ahead,
	.note.ahead {
		color: var(--ahead);
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

	/* The move now playing (or last stepped to). */
	.move.current {
		border-radius: 3px;
		outline: 2px solid var(--accent);
		outline-offset: 1px;
		background: color-mix(in srgb, var(--accent) 15%, transparent);
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
