<script lang="ts">
	import '../app.css';
	import { asset } from '$app/paths';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<!-- The icons are made from the site's own cube: scripts/favicon.js. -->
	<link rel="icon" type="image/png" sizes="32x32" href={asset('/favicon.png')} />
	<link rel="icon" type="image/png" sizes="192x192" href={asset('/favicon-192.png')} />
	<link rel="apple-touch-icon" href={asset('/apple-touch-icon.png')} />
</svelte:head>

{@render children()}
