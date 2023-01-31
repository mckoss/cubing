import * as THREE from "three";

import { Face, Axis, Cubie, Selection,
    selectCubies, rotateCubies, buildCube } from "./cubies";

let canvas: HTMLCanvasElement | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;

const colors = ['white', 'green', 'red', 'blue', 'orange', 'yellow'] as const;

// Space between cubies (of unit dimension)
const OFFSET = 1.1;
const SIZE = 3;

// Radians per millisecond
const SPEED = 2 * Math.PI / 1000;

interface Action {
    axis: Axis;
    turns: number;
    selection: Selection;
}

const animationQueue: Action[] = [];
let currentAction: Action | undefined;
let startTime = 0;
let lastTime = 0;
let endTime = 0;
let speed = 0;

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

// Stationary cubies
let staticGroup: THREE.Group | undefined;
// Currently rotating cubies
let movingGroup: THREE.Group | undefined;

// Array of all created cubies and their current
// location in the cube.
let cubies: Cubie<THREE.Group>[] = [];
let movingCubies: Cubie<THREE.Group>[] = [];

type ActionMap = {[key: string]: Action};

const ACTIONS: ActionMap = {
    x: {
        axis: 'x',
        turns: 1,
        selection: {},
    },
    y: {
        axis: 'y',
        turns: 1,
        selection: {},
    },
    z: {
        axis: 'z',
        turns: 1,
        selection: {},
    },
    r: {
        axis: 'x',
        turns: 1,
        selection: {col: SIZE - 1},
    },
    f: {
        axis: 'z',
        turns: 1,
        selection: {depth: 0},
    },
    u: {
        axis: 'y',
        turns: 1,
        selection: {row: SIZE - 1},
    },
    l: {
        axis: 'x',
        turns: -1,
        selection: {col: 0},
    },
    b: {
        axis: 'z',
        turns: -1,
        selection: {depth: SIZE - 1},
    },
    d: {
        axis: 'y',
        turns: -1,
        selection: {row: 0},
    },
    m: {
        axis: 'x',
        turns: -1,
        selection: {col: 1},
    },
    e: {
        axis: 'y',
        turns: -1,
        selection: {row: 1},
    },
    s: {
        axis: 'z',
        turns: 1,
        selection: {depth: 1},
    },
};

// Initialize THREE.js scene and build a Cubing Cube.
function init() {
    canvas = document.getElementById("render-canvas") as HTMLCanvasElement;
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({canvas: canvas});
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    scene.background = new THREE.Color(0x202020);

    camera.position.x = SIZE;
    camera.position.y = SIZE;
    camera.position.z = SIZE * 1.8;
    camera.lookAt(0, 0, 0);
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);

    const light = new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1);
    scene.add(light);

    cubies = buildCube(SIZE, makeCubie);
    staticGroup = new THREE.Group();
    for (let cubie of cubies) {
        staticGroup.add(cubie.cubie);
    }
    scene.add(staticGroup);
    movingGroup = new THREE.Group();
    scene.add(movingGroup);

    canvas.addEventListener("keydown", handleKey);
    canvas.focus();

    renderer.render(scene, camera);

    requestAnimationFrame(render);
}

function handleKey(ev: KeyboardEvent) {
    const key = ev.key.toLowerCase();

    if (ACTIONS[key] === undefined) {
        console.log("Unknown key: " + key);
        return;
    }

    const action = {...ACTIONS[key]};
    // Reverse direction if shift key is pressed
    if (ev.shiftKey) {
        action.turns = -action.turns;
    }

    animationQueue.push(action);
}

// This is the animation loop.  We update the cube's orientation
// to make it look like it is spinning.
function render(millis: number) {
    requestAnimationFrame(render);

    if (currentAction === undefined) {
        initAnimation(millis);
        return;
    }

    animate(millis);

    renderer!.render(scene!, camera!);
}

function initAnimation(millis: number) {
    if (animationQueue.length === 0) {
        return;
    }

    currentAction = animationQueue.shift()!;
    startTime = millis;
    const angle = -currentAction.turns * Math.PI / 2;
    speed = (angle >= 0 ? 1 : -1) * SPEED;
    endTime = startTime + angle / speed;
    lastTime = millis;

    movingCubies = selectCubies(cubies, currentAction.selection);
    for (let cubie of movingCubies) {
        movingGroup!.attach(cubie.cubie);
    }
}

function animate(millis: number) {
    let elapsed = millis - lastTime;
    if (millis > endTime) {
        elapsed = endTime - lastTime;
    }
    lastTime = millis;

    const angle = elapsed * speed;

    const axis = AXES[currentAction!.axis];
    movingGroup!.rotateOnWorldAxis(axis, angle);

    if (millis > endTime) {
        finishAnimation();
    }
}

function finishAnimation() {
    rotateCubies(movingCubies, currentAction!.axis, currentAction!.turns, SIZE);
    for (let cubie of movingCubies) {
        staticGroup!.attach(cubie.cubie);
    }
    currentAction = undefined;
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

init();
