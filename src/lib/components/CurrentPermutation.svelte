<script lang="ts">
	// The cube's arrangement, in cycle notation, as the moves play.
	import type { Player } from '$lib/cube/player.svelte';

	let { player }: { player: Player } = $props();
</script>

<section class="card">
	<h2>Current Permutation</h2>
	<p class="perm" data-testid="permutation">
		{player.solved ? 'Solved' : player.perm.toString()}
	</p>
</section>

<style>
	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.05rem;
	}

	.perm {
		margin: 0;
		font-family: var(--mono);
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
</style>
