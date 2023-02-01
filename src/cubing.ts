import * as THREE from "three";

import { Face, Axis, Cubie,
    selectCubies, rotateCubies, buildCube, Move, MOVES } from "./cubies";

export { Cubing };

const colors = ['white', 'green', 'red', 'blue', 'orange', 'yellow'] as const;

// Space between cubies (of unit dimension)
const OFFSET = 1.1;

// Radians per millisecond
const SPEED = 2 * Math.PI / 1000;

type Normal = [number, number, number];

const faceNormals: ReadonlyArray<Normal> = [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
    [0, 0, -1],
    [-1, 0, 0],
    [0, -1, 0]
];

const AXES: {[key in Axis]: THREE.Vector3} = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
} as const;

class Cubing {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    size: number;

    animationQueue: Move[] = [];
    currentAction: Move | undefined;
    startTime = 0;
    lastTime = 0;
    endTime = 0;
    speed = 0;

    // Stationary cubies
    staticGroup: THREE.Group;
    // Currently rotating cubies
    movingGroup: THREE.Group;

    // Array of all created cubies and their current
    // location in the cube.
    cubies: Cubie<THREE.Group>[];
    movingCubies: Cubie<THREE.Group>[] = [];

    constructor(canvas: HTMLCanvasElement, size = 3) {
        this.canvas = canvas;
        this.size = size;

        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({canvas: canvas});
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        this.scene.background = new THREE.Color(0x202020);

        this.camera.position.x = size;
        this.camera.position.y = size;
        this.camera.position.z = size * 1.8;
        this.camera.lookAt(0, 0, 0);
        this.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);

        const light = new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1);
        this.scene.add(light);

        this.cubies = buildCube(size, makeCubie);
        this.staticGroup = new THREE.Group();
        for (let cubie of this.cubies) {
            this.staticGroup.add(cubie.cubie);
        }
        this.scene.add(this.staticGroup);
        this.movingGroup = new THREE.Group();
        this.scene.add(this.movingGroup);

        canvas.addEventListener("keydown", this.handleKey.bind(this));
        canvas.focus();

        this.renderer.render(this.scene, this.camera);

        requestAnimationFrame(this.render.bind(this));
    }

    handleKey(ev: KeyboardEvent) {
        const key = ev.key.toUpperCase();

        if (MOVES[key] === undefined) {
            console.log("Unknown key: " + key);
            return;
        }

        const action = {...MOVES[key]};
        // Reverse direction if shift key is pressed
        if (ev.shiftKey) {
            action.turns = -action.turns;
        }

        this.animationQueue.push(action);
        ev.stopPropagation();
    }

    // This is the animation loop.  We update the cube's orientation
    // to make it look like it is spinning.
    render(millis: number) {
        requestAnimationFrame(this.render.bind(this));

        if (this.currentAction === undefined) {
            this.initAnimation(millis);
            return;
        }

        this.animate(millis);

        this.renderer.render(this.scene, this.camera);
    }

    initAnimation(millis: number) {
        if (this.animationQueue.length === 0) {
            return;
        }

        this.currentAction = this.animationQueue.shift()!;
        this.startTime = millis;
        const angle = -this.currentAction.turns * Math.PI / 2;
        this.speed = (angle >= 0 ? 1 : -1) * SPEED;
        this.endTime = this.startTime + angle / this.speed;
        this.lastTime = millis;

        this.movingCubies = selectCubies(this.cubies, this.currentAction.selection, this.size);
        for (let cubie of this.movingCubies) {
            this.movingGroup.attach(cubie.cubie);
        }
    }

    animate(millis: number) {
        let elapsed = millis - this.lastTime;
        if (millis > this.endTime) {
            elapsed = this.endTime - this.lastTime;
        }
        this.lastTime = millis;

        const angle = elapsed * this.speed;

        const axis = AXES[this.currentAction!.axis];
        this.movingGroup!.rotateOnWorldAxis(axis, angle);

        if (millis > this.endTime) {
            this.finishAnimation();
        }
    }

    finishAnimation() {
        rotateCubies(this.movingCubies, this.currentAction!.axis, this.currentAction!.turns, this.size);
        for (let cubie of this.movingCubies) {
            this.staticGroup!.attach(cubie.cubie);
        }
        this.currentAction = undefined;
    }
}

// Build a cubie with all it's visible faces
// added to one object.  If the cubie is completely hidden
// we return null.
function makeCubie(row: number, col: number, depth:number, size: number, faces: Face[]): THREE.Group {
    const cubie = new THREE.Group();

    for (let face of faces) {
        addFace(face, cubie);
    }
    cubie.position.x = (col - (size - 1)/2) * OFFSET;
    cubie.position.y = (row - (size - 1)/2) * OFFSET;
    cubie.position.z = -(depth - (size - 1)/2) * OFFSET;
    return cubie;
}

// Add a face to a cubie (at the origin).
// It will be oriented so that the visible face is
// facing outward.
function addFace(face: Face, cubie: THREE.Group) {
    // Default face is facing forward.
    const g = new THREE.PlaneGeometry(1, 1);
    const color = colors[face];

    // TODO: Why is this cast necessary?
    const normal: Normal = faceNormals[face] as Normal;

    const m = new THREE.MeshStandardMaterial({ color: color as THREE.ColorRepresentation });
    const sticker = new THREE.Mesh(g, m);

    if (normal[0] !== 0) {
        sticker.rotateY(Math.PI / 2 * normal[0]);
    }
    if (normal[1] !== 0) {
        sticker.rotateX(-Math.PI / 2 * normal[1]);
    }
    if (normal[2] === -1) {
        sticker.rotateX(Math.PI);
    }

    sticker.position.x = normal[0] / 2;
    sticker.position.y = normal[1] / 2;
    sticker.position.z = normal[2] / 2;

    cubie.add(sticker);
}
