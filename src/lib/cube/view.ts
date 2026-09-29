// A 3D view of the cube, drawn with Three.js.
//
// Based on the 2023 Cubing simulator: the cubies turning in a move are
// attached to a group, which is rotated, and then returned to the cube.
// The colors, face labels, flip, and speeds are from the 2003 simulator.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
	ModelFace,
	MOVES,
	buildCube,
	rotateCubies,
	selectCubies,
	type Axis,
	type CubieModel,
	type ModelTurn
} from './cubies';
import type { Move } from './types';

// Every face of the model.
const MODEL_FACES: readonly ModelFace[] = [
	ModelFace.UP,
	ModelFace.FRONT,
	ModelFace.RIGHT,
	ModelFace.BACK,
	ModelFace.LEFT,
	ModelFace.DOWN
];

// The 2003 colors.
const FACE_COLORS: Record<ModelFace, string> = {
	[ModelFace.UP]: 'rgb(238, 209, 0)',
	[ModelFace.FRONT]: 'rgb(53, 110, 239)',
	[ModelFace.RIGHT]: 'rgb(255, 71, 19)',
	[ModelFace.BACK]: 'rgb(57, 166, 59)',
	[ModelFace.LEFT]: 'rgb(167, 31, 31)',
	[ModelFace.DOWN]: 'rgb(255, 243, 253)'
};

const FACE_NAMES: Record<ModelFace, string> = {
	[ModelFace.UP]: 'Up',
	[ModelFace.FRONT]: 'Front',
	[ModelFace.RIGHT]: 'Right',
	[ModelFace.BACK]: 'Back',
	[ModelFace.LEFT]: 'Left',
	[ModelFace.DOWN]: 'Down'
};

const FACE_NORMALS: Record<ModelFace, THREE.Vector3> = {
	[ModelFace.UP]: new THREE.Vector3(0, 1, 0),
	[ModelFace.FRONT]: new THREE.Vector3(0, 0, 1),
	[ModelFace.RIGHT]: new THREE.Vector3(1, 0, 0),
	[ModelFace.BACK]: new THREE.Vector3(0, 0, -1),
	[ModelFace.LEFT]: new THREE.Vector3(-1, 0, 0),
	[ModelFace.DOWN]: new THREE.Vector3(0, -1, 0)
};

const AXES: Record<Axis, THREE.Vector3> = {
	x: new THREE.Vector3(1, 0, 0),
	y: new THREE.Vector3(0, 1, 0),
	z: new THREE.Vector3(0, 0, 1)
};

// Space between cubies (of unit size).
const OFFSET = 1.04;

// Turning speeds, in degrees per second (as in 2003).
export const SPEEDS = { Slow: 180, Fast: 360, Fastest: 10000 } as const;
export type Speed = keyof typeof SPEEDS;
export const SPEED_NAMES: readonly Speed[] = ['Slow', 'Fast', 'Fastest'];

interface Turning {
	axis: THREE.Vector3;
	remaining: number;
	direction: number;
	cubies: CubieModel<THREE.Group>[];
	move: ModelTurn;
	done: () => void;
}

export class CubeView {
	speed: Speed = 'Slow';

	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
	private controls: OrbitControls;
	// Everything that flips over: the cube and the face labels.
	private root = new THREE.Group();
	private cube = new THREE.Group();
	private turningGroup = new THREE.Group();
	private labels = new THREE.Group();
	private cubies: CubieModel<THREE.Group>[] = [];
	private turning: Turning | undefined;
	private flipRemaining = 0;
	private lastTime: number | undefined;
	private frame = 0;
	private resizeObserver: ResizeObserver;
	private disposables: { dispose(): void }[] = [];

	// Instant: moves (and flips) happen at once, without turning, for tests.
	// Shadow: the cube casts a soft shadow on an invisible floor (for the
	// icons, scripts/favicon.js).
	constructor(
		private canvas: HTMLCanvasElement,
		private size = 3,
		private instant = false,
		shadow = false
	) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;

		this.camera.position.set(size * 1.7, size * 1.5, size * 2.9);
		this.camera.lookAt(0, 0, 0);

		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.enableDamping = true;
		this.controls.enablePan = false;
		this.controls.minDistance = size * 2.2;
		this.controls.maxDistance = size * 6;

		// Light from all around, so that the bottom (white) still looks white
		// when the cube is turned to look at it.
		this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9aac, 2.2));
		const key = new THREE.DirectionalLight(0xffffff, 1.6);
		key.position.set(4, 8, 6);
		this.scene.add(key);
		const fill = new THREE.DirectionalLight(0xffffff, 0.6);
		fill.position.set(-6, -2, -4);
		this.scene.add(fill);
		const below = new THREE.DirectionalLight(0xffffff, 1.2);
		below.position.set(-2, -8, 3);
		this.scene.add(below);

		this.cube.add(this.turningGroup);
		this.root.add(this.cube, this.labels);
		this.scene.add(this.root);

		this.buildCubies();
		this.buildLabels();
		if (shadow) {
			this.addShadow();
		}

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(canvas);
		this.resize();

		this.frame = requestAnimationFrame(this.render);
	}

	// A floor that shows only the shadow on it (its alpha), lit from above
	// by a light that adds no light of its own.
	private addShadow(): void {
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		const light = new THREE.DirectionalLight(0xffffff, 0);
		light.position.set(-1.5, 10, -1);
		light.castShadow = true;
		light.shadow.mapSize.set(512, 512);
		light.shadow.radius = 10;
		const reach = this.size * 2;
		Object.assign(light.shadow.camera, {
			left: -reach,
			right: reach,
			top: reach,
			bottom: -reach,
			near: 1,
			far: 30
		});
		this.scene.add(light);

		this.cube.traverse((object) => {
			object.castShadow = true;
		});
		const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.45 });
		const floor = new THREE.Mesh(new THREE.PlaneGeometry(reach * 3, reach * 3), floorMaterial);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = -this.size / 2 - 0.02;
		floor.receiveShadow = true;
		this.scene.add(floor);
		this.disposables.push(floor.geometry, floorMaterial);
	}

	get busy(): boolean {
		return this.turning !== undefined || this.flipRemaining > 0;
	}

	// Animate a move; resolves when it is finished.
	turn(move: Move): Promise<void> {
		if (this.turning !== undefined) {
			throw new Error('Already turning');
		}
		const base = MOVES[move.name];
		const cubieMove: ModelTurn = {
			...base,
			turns: base.turns * (move.turns === 3 ? -1 : move.turns)
		};
		const angle = (-cubieMove.turns * Math.PI) / 2;

		const cubies = selectCubies(this.cubies, cubieMove.selection, this.size);
		for (const cubie of cubies) {
			this.turningGroup.attach(cubie.cubie);
		}

		if (this.instant) {
			this.turningGroup.rotateOnWorldAxis(AXES[cubieMove.axis], angle);
			this.settle(cubies, cubieMove);
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			this.turning = {
				axis: AXES[cubieMove.axis],
				remaining: Math.abs(angle),
				direction: Math.sign(angle),
				cubies,
				move: cubieMove,
				done: resolve
			};
		});
	}

	// Turn the view of the cube upside down (not a move).
	flip(): void {
		if (this.instant) {
			this.root.rotateOnWorldAxis(AXES.x, Math.PI);
		} else if (this.flipRemaining === 0) {
			this.flipRemaining = Math.PI;
		}
	}

	// Put the cube back in its solved state.
	reset(): void {
		if (this.turning !== undefined) {
			this.finishTurn();
		}
		for (const cubie of this.cubies) {
			this.cube.remove(cubie.cubie);
		}
		this.buildCubies();
	}

	set showLabels(show: boolean) {
		this.labels.visible = show;
	}

	dispose(): void {
		cancelAnimationFrame(this.frame);
		this.resizeObserver.disconnect();
		this.controls.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.renderer.dispose();
	}

	private render = (time: number): void => {
		this.frame = requestAnimationFrame(this.render);
		const elapsed = this.lastTime === undefined ? 0 : (time - this.lastTime) / 1000;
		this.lastTime = time;
		const step = (elapsed * SPEEDS[this.speed] * Math.PI) / 180;

		if (this.flipRemaining > 0) {
			const angle = Math.min(step, this.flipRemaining);
			this.root.rotateOnWorldAxis(AXES.x, angle);
			this.flipRemaining -= angle;
		} else if (this.turning !== undefined) {
			const angle = Math.min(step, this.turning.remaining);
			this.turningGroup.rotateOnWorldAxis(this.turning.axis, angle * this.turning.direction);
			this.turning.remaining -= angle;
			if (this.turning.remaining <= 0) {
				this.finishTurn();
			}
		}

		this.controls.update();
		this.renderer.render(this.scene, this.camera);
	};

	private finishTurn(): void {
		if (this.turning === undefined) {
			return;
		}
		const { cubies, move, done } = this.turning;
		this.settle(cubies, move);
		this.turning = undefined;
		done();
	}

	// Put the cubies turned by a move (in the turning group, turned all the
	// way) back in the cube, in their new places.
	private settle(cubies: CubieModel<THREE.Group>[], move: ModelTurn): void {
		rotateCubies(cubies, move.axis, move.turns, this.size);
		for (const cubie of cubies) {
			this.cube.attach(cubie.cubie);
			this.snap(cubie);
		}
		this.turningGroup.rotation.set(0, 0, 0);
	}

	// Remove any rounding errors: put the cubie exactly in its place, turned
	// by an exact multiple of 90 degrees.
	private snap(cubie: CubieModel<THREE.Group>): void {
		const group = cubie.cubie;
		group.position.copy(this.positionOf(cubie.row, cubie.col, cubie.depth));
		const m = new THREE.Matrix4().makeRotationFromQuaternion(group.quaternion);
		const e = m.elements.map((v) => Math.round(v));
		m.fromArray(e);
		group.quaternion.setFromRotationMatrix(m);
	}

	private positionOf(row: number, col: number, depth: number): THREE.Vector3 {
		const center = (this.size - 1) / 2;
		return new THREE.Vector3(
			(col - center) * OFFSET,
			(row - center) * OFFSET,
			-(depth - center) * OFFSET
		);
	}

	private buildCubies(): void {
		const body = new RoundedBoxGeometry(1, 1, 1, 3, 0.12);
		const plastic = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.5 });
		const sticker = new RoundedBoxGeometry(0.86, 0.86, 0.04, 2, 0.02);
		const materials = new Map<ModelFace, THREE.Material>();
		for (const face of MODEL_FACES) {
			materials.set(
				face,
				new THREE.MeshStandardMaterial({ color: FACE_COLORS[face], roughness: 0.35 })
			);
		}
		this.disposables.push(body, plastic, sticker, ...materials.values());

		this.cubies = buildCube(this.size, (row, col, depth, _size, faces) => {
			const group = new THREE.Group();
			group.add(new THREE.Mesh(body, plastic));
			for (const face of faces) {
				const mesh = new THREE.Mesh(sticker, materials.get(face));
				const normal = FACE_NORMALS[face];
				mesh.position.copy(normal).multiplyScalar(0.5);
				mesh.lookAt(normal.clone().multiplyScalar(2));
				mesh.userData.face = face;
				group.add(mesh);
			}
			group.position.copy(this.positionOf(row, col, depth));
			this.cube.add(group);
			return group;
		});
	}

	// Face names floating by each face, as in 2003.
	private buildLabels(): void {
		for (const f of MODEL_FACES) {
			const name = FACE_NAMES[f];
			const canvas = document.createElement('canvas');
			canvas.width = 256;
			canvas.height = 96;
			const ctx = canvas.getContext('2d');
			if (ctx === null) {
				throw new Error('No 2D canvas context');
			}
			ctx.font = '600 56px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.lineWidth = 8;
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
			ctx.strokeText(name, 128, 48);
			ctx.fillStyle = FACE_COLORS[f];
			ctx.fillText(name, 128, 48);

			const texture = new THREE.CanvasTexture(canvas);
			texture.colorSpace = THREE.SRGBColorSpace;
			const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
			const sprite = new THREE.Sprite(material);
			sprite.scale.set(1.4, 0.525, 1);
			sprite.position.copy(FACE_NORMALS[f]).multiplyScalar(this.size * 0.5 + 1.3);
			sprite.name = `label-${name}`;
			this.labels.add(sprite);
			this.disposables.push(texture, material);
		}
	}

	private resize(): void {
		const { clientWidth: width, clientHeight: height } = this.canvas;
		if (width === 0 || height === 0) {
			return;
		}
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}
}
