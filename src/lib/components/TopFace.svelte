<script lang="ts">
	// The top face of the cube, seen from above with the front edge at the
	// bottom. `up` lists the edges (F, R, B, L) showing the top color.
	import type { Face } from '$lib/cube/types';

	// A cell of the grid: an edge's face, the center (C), or a corner ('').
	type GridCell = Face | 'C' | '';

	let { up, label }: { up: readonly Face[]; label: string } = $props();

	const YELLOW = 'rgb(238, 209, 0)';
	const OTHER = '#8b93a1';

	// Grid cells, row by row from the back: which edge (if any) each one is.
	const CELLS: readonly (readonly GridCell[])[] = [
		['', 'B', ''],
		['L', 'C', 'R'],
		['', 'F', '']
	];

	function color(cell: GridCell): string {
		return cell === 'C' || (cell !== '' && up.includes(cell)) ? YELLOW : OTHER;
	}
</script>

<svg viewBox="0 0 76 76" role="img" aria-label={label} class="top-face">
	<rect x="1" y="1" width="74" height="74" rx="8" fill="#1b1b1f" />
	{#each CELLS as row, r (r)}
		{#each row as cell, c (c)}
			<rect x={6 + c * 22} y={6 + r * 22} width="20" height="20" rx="3" fill={color(cell)} />
		{/each}
	{/each}
</svg>

<style>
	.top-face {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
