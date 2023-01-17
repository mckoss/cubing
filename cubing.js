// THREE is loaded in this script in the settings tab

let renderer;
let scene;
let camera;
let group;

// Face indexes
const UP = 0;
const FRONT = 1;
const RIGHT = 2;
const BACK = 3;
const LEFT = 4;
const DOWN = 5;

const colors = ['white', 'green', 'red', 'blue', 'orange', 'yellow'];

// Space between cubies (of unit dimension)
const OFFSET = 1.1;
const SIZE = 3;

// Radians per millisecond
const SPEED = 5 * Math.PI / 1000;

const actions = [];
let currentAction;
let startTime;
let lastTime;
let speed;

const faceNormals = [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0],
    [0, 0, -1],
    [-1, 0, 0],
    [0, -1, 0]
];

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// The cube group here
let cube;

// Array of all created cubies and their current
// location in the cube.
const cubies = [];

// Currently rotating slice
let slice;
let sliceCubies;

// Initialize THREE.js scene and build a Cubing Cube.
function init() {
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    document.body.appendChild(renderer.domElement);
    scene.background = new THREE.Color('black');

    camera.position.x = SIZE;
    camera.position.y = SIZE;
    camera.position.z = SIZE * 1.8;
    camera.lookAt(0, 0, 0);
    renderer.setSize(400, 400);

    const light = new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1);
    scene.add(light);

    cube = buildCube(SIZE);
    scene.add(cube);
    slice = new THREE.Group();
    scene.add(slice);

    window.addEventListener("keydown", handleKey);

    renderer.render(scene, camera);

    requestAnimationFrame(render);
}

function handleKey(ev) {
    const key = ev.key;

    switch (key) {
    case 'x':
        actions.push({
            action: "RX",
            limit: Math.PI / 2,
        });
        break;
    case 'X':
        actions.push({
            action: "RX",
            limit: -Math.PI / 2,
        });
        break;
    case 'y':
        actions.push({
            action: "RY",
            limit: Math.PI / 2,
        });
        break;
    case 'Y':
        actions.push({
            action: "RY",
            limit: -Math.PI / 2,
        });
        break;
    case 'z':
        actions.push({
            action: "RZ",
            limit: Math.PI / 2,
        });
        break;
    case 'Z':
        actions.push({
            action: "RZ",
            limit: -Math.PI / 2,
        });
        break;
    case 'r':
        actions.push({
            action: 'R',
            turns: 1,
            limit: -Math.PI / 2,
        });
        break;
    case 'R':
        actions.push({
            action: 'R',
            turns: -1,
            limit: Math.PI / 2,
        });
        break;
    default:
        console.log(`Unknown key: ${key}`);
        break;
    }
}

// This is the animation loop.  We update the cube's orientation
// to make it look like it is spinning.
function render(millis) {
    requestAnimationFrame(render);

    if (currentAction === undefined) {
        initAction(millis);
        return;
    }

    doAction(millis);

    renderer.render(scene, camera);
}

function initAction(millis) {
    if (actions.length === 0) {
        return;
    }

    currentAction = actions.shift();
    startTime = millis;
    speed = (currentAction.limit >= 0 ? 1 : -1) * SPEED;
    endTime = startTime + currentAction.limit / speed;
    lastTime = millis;

    switch (currentAction.action) {
    case 'R':
        sliceCubies = selectCubies(undefined, SIZE-1, undefined);
        for (let cubie of sliceCubies) {
            slice.attach(cubie.cubie);
        }
        break;
    }
}

function doAction(millis) {
    let elapsed = millis - lastTime;
    if (millis > endTime) {
        elapsed = endTime - lastTime;
    }
    lastTime = millis;

    const angle = elapsed * speed;

    switch (currentAction.action) {
    case 'RX':
        // cube.rotateX(fraction * currentAction.limit);
        cube.rotateOnWorldAxis(X_AXIS, angle);
        break;
    case 'RY':
        cube.rotateOnWorldAxis(Y_AXIS, angle);
        break;
    case 'RZ':
        cube.rotateOnWorldAxis(Z_AXIS, angle);
        break;
    case 'R':
        slice.rotateOnWorldAxis(X_AXIS, angle);
        break;
    default:
        console.log(`Unknown action ${currentAction.action}`);
        break;
    }

    if (millis > endTime) {
        finalizeAction();
    }
}

function finalizeAction() {
    switch (currentAction.action) {
    case 'R':
        rotateCubies(sliceCubies, 'x', currentAction.turns);
        clearSlice();
        break;
    }

    currentAction = undefined;

    function clearSlice() {
        for (let cubie of sliceCubies) {
            cube.attach(cubie.cubie);
        }
    }
}

// Make a whole cube by enumerating all the cubies
// and adding them to a group.
function buildCube(size, group) {
    const cube = new THREE.Group();
    for (let depth = 0; depth < size; depth++) {
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const cubie = makeCubie(row, col, depth, size);
                if (cubie !== null) {
                    cubies.push({
                        row, col, depth, cubie
                    })
                    cube.add(cubie);
                }
            }
        }
    }
    return cube;
}

// Build a cubie with all it's visible faces
// added to one object.  If the cubie is completely hidden
// we return null.
function makeCubie(row, column, depth, size) {
    const g = new THREE.PlaneGeometry(1, 1);
    const cubie = new THREE.Group();
    const faces = facesOf(row, column, depth, size);
    if (faces.length === 0) {
        return null;
    }

    for (let face of faces) {
        addFace(face, cubie);
    }
    cubie.position.x = (column - (size - 1)/2) * OFFSET;
    cubie.position.y = (row - (size - 1)/2) * OFFSET;
    cubie.position.z = -(depth - (size - 1)/2) * OFFSET;
    return cubie;
}

// Add a face to a cubie (at the origin).
// It will be oriented so that the visible face is
// facing outward.
function addFace(face, cubie) {
    if (face === undefined) {
        return;
    }

    // Default face is facing forward.
    const g = new THREE.PlaneGeometry(1, 1);
    const color = colors[face];
    const normal = faceNormals[face];

    const m = new THREE.MeshStandardMaterial({ color });
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

// Return a list of the visible faces depending on the
// coordinates of the cubie.
function facesOf(row, column, depth, size) {
    const faces = [];
    if (row === 0) {
        faces.push(DOWN)
    }
    if (row === size - 1) {
        faces.push(UP);
    }
    if (column === 0) {
        faces.push(LEFT);
    }
    if (column === size - 1) {
        faces.push(RIGHT);
    }
    if (depth === 0) {
        faces.push(FRONT);
    }
    if (depth === size - 1) {
        faces.push(BACK);
    }
    return faces;
}

function selectCubies(row, col, depth) {
    const selected = [];
    for (let cubie of cubies) {
        if (match(row, cubie.row) &&
            match(col, cubie.col) &&
            match(depth, cubie.depth)) {
                selected.push(cubie);
            }
    }

    return selected;

    function match(sel, value) {
        return (sel === undefined || sel === value);
    }
}

// Transform x,y coordinates (0-based) based on
// the number of 90 degree (clockwise) turns;
function turn(x, y, turns) {
    if (turns < 0) {
        turns = - turns;
    }
    while (turns < 0) {
        turns += 4;
    }
    while (turns > 0) {
        [x, y] = [y, SIZE - x];
        turns -= 1;
    }
    return [x, y];
}

// Update the meta-data in the cubes list to reflect a rotation.
function rotateCubies(cubies, axis, turns) {
    for (let cubie of cubies) {
        if (axis === 'x') {
            [cubie.depth, cubie.row] = turn(cubie.depth, cubie.row, turns);
        } else if (axis === 'y') {
            [cubie.col, cubie.depth] = turn(cubie.col, cubie.depth, turns);
        } else if (axis === 'z') {
            [cubie.col, cubie.row] = turn(cubie.col, cubie.row, turns);
        }
    }
}

init();
