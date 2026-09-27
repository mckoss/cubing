<script lang="ts">
	// How the top cross comes together: the top face at each step, and what
	// to do between them. (Checked with the simulator: from a dot, the
	// sequence makes an L at the front right; from an L at the back left, a
	// line from left to right; and from that line, the cross.)
	import TopFace from './TopFace.svelte';

	let { sequence }: { sequence: string } = $props();

	type Step = { up: string; name: string; hold: string } | { move: string; note?: string };
	const steps: Step[] = $derived([
		{ up: '', name: 'Dot', hold: 'Hold it any way.' },
		{ move: sequence },
		{ up: 'FR', name: 'L', hold: 'Makes an L.' },
		{ move: 'U2', note: 'Turn the top' },
		{ up: 'BL', name: 'L at the back left', hold: 'Hold the L at the back and left.' },
		{ move: sequence },
		{ up: 'RL', name: 'Line', hold: 'Hold the line left to right.' },
		{ move: sequence },
		{ up: 'FRBL', name: 'Cross', hold: 'Done!' }
	]);
</script>

<div class="steps" data-testid="top-cross-steps">
	{#each steps as step, i (i)}
		{#if 'move' in step}
			<div class="arrow">
				{#if step.note}<span class="note">{step.note}</span>{/if}
				<code>{step.move}</code>
				<span class="across" aria-hidden="true">→</span>
				<span class="down" aria-hidden="true">↓</span>
			</div>
		{:else}
			<figure>
				<TopFace
					up={step.up}
					label={`${step.name}: top face with ${step.up || 'no'} edges yellow`}
				/>
				<figcaption><strong>{step.name}</strong><br />{step.hold}</figcaption>
			</figure>
		{/if}
	{/each}
</div>
<p class="warning">
	Hold it the wrong way and the sequence won't help: an L at any other corner just comes back as the
	same L, and a line from front to back goes back to a dot. Turn the top (U) first.
</p>

<style>
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 0.5rem;
		align-items: center;
		margin: 0.75rem 0 0.5rem;
	}

	figure {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 7.5rem;
		margin: 0;
		text-align: center;
	}

	figcaption {
		margin-top: 0.25rem;
		font-size: 0.8rem;
		line-height: 1.3;
		color: var(--muted);
	}

	figcaption strong {
		color: var(--text);
	}

	.arrow {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.arrow code {
		white-space: nowrap;
	}

	.arrow span[aria-hidden] {
		font-size: 1.4rem;
		line-height: 1;
	}

	.down {
		display: none;
	}

	/* On narrow screens, read the steps from top to bottom. */
	@media (max-width: 640px) {
		.steps {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.4rem;
		}

		figure {
			flex-direction: row;
			align-items: center;
			gap: 0.75rem;
			width: auto;
			text-align: left;
		}

		.arrow {
			flex-direction: row;
			gap: 0.5rem;
			padding-left: 1.6rem;
		}

		.across {
			display: none;
		}

		.down {
			display: inline;
		}
	}

	.note {
		font-size: 0.75rem;
	}

	.warning {
		font-size: 0.9rem;
		color: var(--muted);
	}
</style>
