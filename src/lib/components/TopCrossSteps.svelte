<script lang="ts">
	// The four patterns of the top cross, as in Mike's notes: dot, L, line,
	// cross, each reached from the one before with the same sequence. The L
	// and the line are drawn the way to hold them. (Checked with the
	// simulator: from an L at the back left the sequence makes a line from
	// left to right, and from that line, the cross.)
	import type { Face, Notation } from '$lib/cube/types';
	import TopFace from './TopFace.svelte';

	let { sequence }: { sequence: Notation } = $props();

	// The top edges showing yellow in each pattern.
	const PATTERNS: readonly { up: readonly Face[]; name: string }[] = [
		{ up: [], name: 'Dot' },
		{ up: ['B', 'L'], name: 'L' },
		{ up: ['R', 'L'], name: 'Line' },
		{ up: ['F', 'R', 'B', 'L'], name: 'Cross' }
	];
</script>

<figure class="top-cross" data-testid="top-cross-steps">
	<div class="row">
		{#each PATTERNS as { up, name }, i (name)}
			{#if i > 0}<span class="arrow" aria-hidden="true">⇒</span>{/if}
			<div class="pattern">
				<TopFace
					{up}
					label={`${name}: the top face with ${up.length > 0 ? up.length : 'no'} yellow edges`}
				/>
				<span>{name}</span>
			</div>
		{/each}
	</div>
	<figcaption>
		The top face, with the front edge at the bottom. Each arrow is <code>{sequence}</code>. Turn the
		top (U) to hold the L at the back and left, and the line from left to right, as drawn. Held any
		other way, the sequence doesn't move you forward.
	</figcaption>
</figure>

<style>
	.top-cross {
		margin: 0.75rem 0 0.5rem;
	}

	.row {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
	}

	.pattern {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		width: 3.75rem;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.arrow {
		margin-top: 1rem;
		font-size: 1.3rem;
		line-height: 1;
		color: var(--muted);
	}

	@media (min-width: 641px) {
		.pattern {
			width: 5rem;
		}

		.arrow {
			margin-top: 1.5rem;
		}
	}

	figcaption {
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: var(--muted);
	}

	code {
		white-space: nowrap;
	}
</style>
