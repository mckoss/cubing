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

const faceNormals = [
    [0, 1, 0],
    [0, 0, -1],
    [1, 0, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0]
];

// Initialize THREE.js scene and build a Cubing Cube.
function init() {
    const SIZE = 3;

    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer();
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    document.body.appendChild(renderer.domElement);
    scene.background = new THREE.Color('black');

    camera.position.y = 0;
    camera.position.z = SIZE * 2;
    camera.lookAt(0, 0, 0);
    renderer.setSize(400, 400);

    const light = new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1);
    scene.add(light);

    const cube = buildCube(SIZE);
    scene.add(cube);

    render(cube);
}

// This is the animation loop.  We update the cube's orientation
// to make it look like it is spinning.
function render(cube) {
    requestAnimationFrame(() => {
        render(cube);
    });
    cube.rotateY(0.01);
    cube.rotateX(0.005);
    // cube.rotateZ(0.01);
    renderer.render(scene, camera);
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
    cubie.position.z = (depth - (size - 1)/2) * OFFSET;
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

init();
