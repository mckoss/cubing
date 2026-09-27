<script lang="ts" module>
	export type Case =
		| 'middle-left'
		| 'middle-right'
		| 'swap-edges'
		| 'corners'
		| 'corners-back'
		| 'twist'
		| 'twist-back';
</script>

<script lang="ts">
	// Small pictures of what to look for before each sequence of the Basic
	// Modern Solution, after Mike's handwritten notes. The cube uses the 2003
	// colors: yellow top, blue front, orange right, red left.
	//
	//   middle-left / middle-right: the front face; the top edge goes down to
	//     the left or right.
	//   swap-edges: the top face; the left and front edges trade places.
	//   corners / corners-back: the top face; three corners cycle, one stays.
	//   twist / twist-back: the cube from above and to the front right; the
	//     front right corner's yellow sticker faces right (or front).
	let { kind, label }: { kind: Case; label: string } = $props();

	const YELLOW = 'rgb(238, 209, 0)';
	const BLUE = 'rgb(53, 110, 239)';
	const ORANGE = 'rgb(255, 71, 19)';
	const RED = 'rgb(167, 31, 31)';
	const GREEN = 'rgb(57, 166, 59)';
	const GRAY = '#8b93a1';
	const BODY = '#1b1b1f';
	const ARROW = 'white';

	// A 3x3 grid of cells starting at (x, y), with cells of size `s`.
	function cells(x: number, y: number, s: number, fill: (r: number, c: number) => string) {
		const out: { x: number; y: number; s: number; fill: string }[] = [];
		for (let r = 0; r < 3; r++) {
			for (let c = 0; c < 3; c++) {
				out.push({ x: x + c * s + 1, y: y + r * s + 1, s: s - 2, fill: fill(r, c) });
			}
		}
		return out;
	}

	// Center of cell (r, c) of a 3x3 grid at (x, y) with cells of size `s`.
	function at(x: number, y: number, s: number, r: number, c: number) {
		return { x: x + c * s + s / 2, y: y + r * s + s / 2 };
	}

	// Isometric projection for the 3D cube: x to the right, y up, z toward
	// the front; each unit is one cubie.
	const ISO = { x0: 50, y0: 50, s: 15 };
	function iso(x: number, y: number, z: number): [number, number] {
		const c = Math.cos(Math.PI / 6);
		return [ISO.x0 + (x - z) * c * ISO.s, ISO.y0 + ((x + z) / 2 - y) * ISO.s];
	}
	function poly(points: [number, number, number][]): string {
		return points.map((p) => iso(...p).join(',')).join(' ');
	}
	// The sticker at (a, b) on a face of the 3x3x3 cube, inset a little.
	function sticker(face: 'U' | 'F' | 'R', a: number, b: number): string {
		const e = 0.08;
		const [a0, a1, b0, b1] = [a + e, a + 1 - e, b + e, b + 1 - e];
		if (face === 'U') {
			return poly([
				[a0, 3, b0],
				[a1, 3, b0],
				[a1, 3, b1],
				[a0, 3, b1]
			]);
		}
		if (face === 'F') {
			return poly([
				[a0, b0, 3],
				[a1, b0, 3],
				[a1, b1, 3],
				[a0, b1, 3]
			]);
		}
		return poly([
			[3, b0, a0],
			[3, b0, a1],
			[3, b1, a1],
			[3, b1, a0]
		]);
	}
	// The whole cube, with the front right top corner's stickers colored to
	// show where its yellow sticker is.
	function twistCube(yellowOn: 'F' | 'R') {
		const faces: { points: string; fill: string }[] = [];
		// The corner's stickers, turned: with yellow facing right, the orange
		// sticker is in front and the blue one on top; with yellow facing
		// front, blue is on the right and orange on top.
		const corner =
			yellowOn === 'R' ? { U: BLUE, F: ORANGE, R: YELLOW } : { U: ORANGE, F: YELLOW, R: BLUE };
		for (let a = 0; a < 3; a++) {
			for (let b = 0; b < 3; b++) {
				// Top: x = a, z = b; the corner is at x = 2, z = 2.
				faces.push({
					points: sticker('U', a, b),
					fill: a === 2 && b === 2 ? corner.U : YELLOW
				});
				// Front: x = a, y = b; the corner is at x = 2, y = 2.
				faces.push({
					points: sticker('F', a, b),
					fill: a === 2 && b === 2 ? corner.F : b === 2 ? GRAY : BLUE
				});
				// Right: z = a, y = b; the corner is at z = 2, y = 2.
				faces.push({
					points: sticker('R', a, b),
					fill: a === 2 && b === 2 ? corner.R : b === 2 ? GRAY : ORANGE
				});
			}
		}
		return faces;
	}
	const outline = [
		poly([
			[0, 3, 0],
			[3, 3, 0],
			[3, 3, 3],
			[0, 3, 3]
		]),
		poly([
			[0, 0, 3],
			[3, 0, 3],
			[3, 3, 3],
			[0, 3, 3]
		]),
		poly([
			[3, 0, 0],
			[3, 0, 3],
			[3, 3, 3],
			[3, 3, 0]
		])
	];

	// Grids used by the flat pictures.
	const G = { x: 14, y: 20, s: 24 };
	// The top face with side strips around it.
	const T = { x: 14, y: 14, s: 24 };
</script>

<svg viewBox="0 0 100 100" role="img" aria-label={label} class="case">
	<defs>
		<filter id="edge-{kind}" filterUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
			<feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="thick" />
			<feFlood flood-color="#1b1b1f" />
			<feComposite in2="thick" operator="in" result="outline" />
			<feMerge><feMergeNode in="outline" /><feMergeNode in="SourceGraphic" /></feMerge>
		</filter>
		<marker
			id="head-{kind}"
			viewBox="0 0 10 10"
			refX="7"
			refY="5"
			markerWidth="4"
			markerHeight="4"
			orient="auto-start-reverse"
		>
			<path d="M0,0 L10,5 L0,10 z" fill={ARROW} />
		</marker>
	</defs>

	{#if kind === 'middle-left' || kind === 'middle-right'}
		{@const right = kind === 'middle-right'}
		<!-- The front face, like the top face in the swap picture: the color
		     of the top edge's top sticker is a tab above it. -->
		<rect x={G.x - 3} y={G.y - 3} width={G.s * 3 + 6} height={G.s * 3 + 6} rx="6" fill={BODY} />
		<rect
			x={G.x + G.s + 2}
			y={G.y - 12}
			width={G.s - 4}
			height="6"
			rx="2"
			fill={right ? ORANGE : RED}
		/>
		<!-- The edge on top has blue (the front color) on the front; the slot
		     it goes to is outlined. -->
		{#each cells(G.x, G.y, G.s, (r, c) => (c === 1 && r < 2 ? BLUE : GRAY)) as cell, i (i)}
			<rect x={cell.x} y={cell.y} width={cell.s} height={cell.s} rx="3" fill={cell.fill} />
		{/each}
		{@const slot = at(G.x, G.y, G.s, 1, right ? 2 : 0)}
		<rect
			x={slot.x - G.s / 2 + 2}
			y={slot.y - G.s / 2 + 2}
			width={G.s - 4}
			height={G.s - 4}
			rx="3"
			fill="none"
			stroke="white"
			stroke-width="2"
			stroke-dasharray="3 2"
		/>
		{@const from = at(G.x, G.y, G.s, 0, 1)}
		{@const to = at(G.x, G.y, G.s, 1, right ? 2 : 0)}
		<path
			d="M{from.x},{from.y + 4} Q{right ? to.x - 4 : to.x + 4},{from.y + 6} {to.x +
				(right ? -3 : 3)},{to.y - 3}"
			fill="none"
			stroke={ARROW}
			stroke-width="3"
			filter="url(#edge-{kind})"
			marker-end="url(#head-{kind})"
		/>
	{:else if kind === 'swap-edges'}
		<!-- The top face, with the side colors of the top edges around it. -->
		<rect x={T.x - 3} y={T.y - 3} width={T.s * 3 + 6} height={T.s * 3 + 6} rx="6" fill={BODY} />
		{#each cells(T.x, T.y, T.s, () => YELLOW) as cell, i (i)}
			<rect x={cell.x} y={cell.y} width={cell.s} height={cell.s} rx="3" fill={cell.fill} />
		{/each}
		<!-- Back and right already match (green, orange); front and left are
		     swapped (red on the front, blue on the left). -->
		<rect x={T.x + T.s + 2} y={T.y - 12} width={T.s - 4} height="6" rx="2" fill={GREEN} />
		<rect x={T.x + T.s * 3 + 6} y={T.y + T.s + 2} width="6" height={T.s - 4} rx="2" fill={ORANGE} />
		<rect x={T.x + T.s + 2} y={T.y + T.s * 3 + 6} width={T.s - 4} height="6" rx="2" fill={RED} />
		<rect x={T.x - 12} y={T.y + T.s + 2} width="6" height={T.s - 4} rx="2" fill={BLUE} />
		{@const a = at(T.x, T.y, T.s, 1, 0)}
		{@const b = at(T.x, T.y, T.s, 2, 1)}
		<line
			x1={a.x + 3}
			y1={a.y + 3}
			x2={b.x - 3}
			y2={b.y - 3}
			stroke={ARROW}
			stroke-width="3"
			filter="url(#edge-{kind})"
			marker-start="url(#head-{kind})"
			marker-end="url(#head-{kind})"
		/>
	{:else if kind === 'corners' || kind === 'corners-back'}
		{@const back = kind === 'corners-back'}
		<rect x={G.x - 3} y={G.y - 3} width={G.s * 3 + 6} height={G.s * 3 + 6} rx="6" fill={BODY} />
		{#each cells(G.x, G.y, G.s, () => YELLOW) as cell, i (i)}
			<rect x={cell.x} y={cell.y} width={cell.s} height={cell.s} rx="3" fill={cell.fill} />
		{/each}
		{@const bl = at(G.x, G.y, G.s, 0, 0)}
		{@const br = at(G.x, G.y, G.s, 0, 2)}
		{@const fl = at(G.x, G.y, G.s, 2, 0)}
		{@const fr = at(G.x, G.y, G.s, 2, 2)}
		{@const path = back ? [bl, br, fr, bl] : [br, bl, fl, br]}
		{@const stays = back ? fl : fr}
		{#each [0, 1, 2] as i (i)}
			{@const p = path[i]}
			{@const q = path[i + 1]}
			{@const dx = q.x - p.x}
			{@const dy = q.y - p.y}
			{@const len = Math.hypot(dx, dy)}
			<line
				x1={p.x + (dx / len) * 7}
				y1={p.y + (dy / len) * 7}
				x2={q.x - (dx / len) * 8}
				y2={q.y - (dy / len) * 8}
				stroke={ARROW}
				stroke-width="3"
				filter="url(#edge-{kind})"
				marker-end="url(#head-{kind})"
			/>
		{/each}
		<circle
			cx={stays.x}
			cy={stays.y}
			r="6"
			fill="none"
			stroke={ARROW}
			stroke-width="2.5"
			filter="url(#edge-{kind})"
		/>
	{:else}
		{@const yellowOn = kind === 'twist' ? 'R' : 'F'}
		{#each outline as points, i (i)}
			<polygon {points} fill={BODY} stroke={BODY} stroke-width="3" stroke-linejoin="round" />
		{/each}
		{#each twistCube(yellowOn) as face, i (i)}
			<polygon points={face.points} fill={face.fill} />
		{/each}
		<!-- A dot on the yellow sticker, as in Mike's sketch. -->
		{@const [dx, dy] = yellowOn === 'R' ? iso(3, 2.5, 2.5) : iso(2.5, 2.5, 3)}
		<circle cx={dx} cy={dy} r="2.2" fill={BODY} />
		<!-- A curved arrow from the yellow sticker up onto the top. -->
		{@const [tx, ty] = iso(2.5, 3, 2.5)}
		{@const side = yellowOn === 'R' ? 1 : -1}
		<path
			d="M{dx + side * 4},{dy - 2} Q{dx + side * 22},{(dy + ty) / 2 - 10} {tx + side * 4},{ty - 3}"
			fill="none"
			stroke={ARROW}
			stroke-width="3"
			filter="url(#edge-{kind})"
			marker-end="url(#head-{kind})"
		/>
	{/if}
</svg>

<style>
	.case {
		display: block;
		width: 5.5rem;
		height: auto;
		flex: none;
	}
</style>
