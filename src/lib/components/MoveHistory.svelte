<script lang="ts">
	// The move history card: the player's moves, grouped in blocks, in step
	// with the cube: moves not played yet are dimmed, and the move now
	// playing is marked, and kept in view by scrolling the history (not the
	// page).  `controls` go in the heading (e.g. a checkbox for trace lines).
	//
	// Following the move stops when the person scrolls the history so the
	// move is out of view, and starts again when they scroll it back into
	// view, or when moves are added or playback is started or stepped.
	import { tick, type Snippet } from 'svelte';
	import type { Player } from '$lib/cube/player.svelte';
	import HistoryBlock from './HistoryBlock.svelte';

	let {
		player,
		showTrace = true,
		controls
	}: { player: Player; showTrace?: boolean; controls?: Snippet } = $props();

	let scroller: HTMLDivElement;
	let following = true;
	// When the person last scrolled the history themselves (a wheel, touch,
	// or key), or whether they're holding the scrollbar.
	let lastInput = -Infinity;
	let holding = false;

	function currentMove(): HTMLElement | null {
		return scroller.querySelector('[aria-current]');
	}

	// How far to scroll the history to bring an element into view, with a
	// little room around it; 0 if it's in view.
	function offBy(el: HTMLElement, room = 0): number {
		const view = scroller.getBoundingClientRect();
		const box = el.getBoundingClientRect();
		if (box.top < view.top + room) return box.top - view.top - room;
		if (box.bottom > view.bottom - room) return box.bottom - view.bottom + room;
		return 0;
	}

	function userInput(): void {
		lastInput = performance.now();
	}

	function onScroll(): void {
		if (!holding && performance.now() - lastInput > 600) return;
		const el = currentMove();
		if (el) following = offBy(el) === 0;
	}

	// Watch for the person scrolling the history themselves.
	$effect(() => {
		const hold = (): void => {
			holding = true;
		};
		const events = ['wheel', 'touchmove', 'keydown'] as const;
		for (const name of events) scroller.addEventListener(name, userInput, { passive: true });
		scroller.addEventListener('pointerdown', hold);
		return (): void => {
			for (const name of events) scroller.removeEventListener(name, userInput);
			scroller.removeEventListener('pointerdown', hold);
		};
	});

	$effect(() => {
		void player.cue;
		following = true;
	});

	// Keep the move now playing in view.
	$effect(() => {
		void player.playhead;
		void player.history;
		void tick().then(() => {
			const el = currentMove();
			if (!following || !el) return;
			if (offBy(el, 48) === 0) return;
			// Bring it a third of the way down, to show some of what's next.
			const view = scroller.getBoundingClientRect();
			const by = el.getBoundingClientRect().top - view.top - view.height / 3;
			const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
			scroller.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
		});
	});
</script>

<svelte:window
	onpointerup={(): void => {
		holding = false;
	}}
/>

<section class="card history">
	<h2>
		History
		{#if player.pendingCount > 0}<span class="pending">{player.pendingCount} to go</span>{/if}
		{#if controls}<span class="controls">{@render controls()}</span>{/if}
	</h2>
	<div class="scroller" data-testid="history" bind:this={scroller} onscroll={onScroll}>
		{#each player.history as block, i (i)}
			<HistoryBlock {block} head={player.playhead} {showTrace} />
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

	.scroller {
		max-height: 22rem;
		overflow-y: auto;
	}
</style>
