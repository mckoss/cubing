<script lang="ts">
	// The top face of the cube, seen from above with the front edge at the
	// bottom. `up` lists the edges (F, R, B, L) showing the top color.
	let { up, label }: { up: string; label: string } = $props();

	const YELLOW = 'rgb(238, 209, 0)';
	const OTHER = '#8b93a1';

	// Grid cells, row by row from the back: which edge (if any) each one is.
	const CELLS = [
		['', 'B', ''],
		['L', 'C', 'R'],
		['', 'F', '']
	];

	function color(cell: string): string {
		return cell === 'C' || (cell !== '' && up.includes(cell)) ? YELLOW : OTHER;
	}
</script>

<svg viewBox="0 0 76 88" role="img" aria-label={label} class="top-face">
	<rect x="1" y="1" width="74" height="74" rx="8" fill="#1b1b1f" />
	{#each CELLS as row, r (r)}
		{#each row as cell, c (c)}
			<rect x={6 + c * 22} y={6 + r * 22} width="20" height="20" rx="3" fill={color(cell)} />
		{/each}
	{/each}
	<text x="38" y="86" text-anchor="middle">Front</text>
</svg>

<style>
	.top-face {
		display: block;
		width: 84px;
		height: auto;
	}

	text {
		fill: var(--muted);
		font-size: 9px;
		font-family: system-ui, sans-serif;
	}
</style>
