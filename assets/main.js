import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

// --- CONFIGURACIÓN DE ESCENA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505); 
scene.fog = new THREE.Fog(0x050505, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById('container').appendChild(renderer.domElement);

const clock = new THREE.Clock();

// --- LUCES ---
scene.add(new THREE.AmbientLight(0xffffff, 0.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
scene.add(dirLight);

// --- FÍSICAS Y JUGADOR ---
const worldOctree = new Octree();
const playerCapsule = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
let playerOnFloor = false;
const keyStates = {};

// --- BOLAS DE FUEGO ---
const fireballs = [];
const fireballGeometry = new THREE.IcosahedronGeometry(0.2, 2);
const fireballMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff4500, 
    emissive: 0xff0000, 
    emissiveIntensity: 2 
});

// --- CONTROLES ---
document.addEventListener('keydown', (e) => { keyStates[e.code] = true; });
document.addEventListener('keyup', (e) => { keyStates[e.code] = false; });
document.addEventListener('mousedown', () => {
    if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
    } else {
        throwFireball();
    }
});

window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body) {
        camera.rotation.y -= e.movementX / 500;
        camera.rotation.x -= e.movementY / 500;
    }
});

function throwFireball() {
    const ball = new THREE.Mesh(fireballGeometry, fireballMaterial);
    ball.castShadow = true;
    const light = new THREE.PointLight(0xff4500, 15, 6);
    ball.add(light);
    scene.add(ball);

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    ball.position.copy(playerCapsule.end).addScaledVector(dir, 0.5);
    
    fireballs.push({ 
        mesh: ball, 
        velocity: dir.clone().multiplyScalar(30), 
        collider: new THREE.Sphere(ball.position, 0.2) 
    });
}

// --- CARGA DEL ESCENARIO ---
const loader = new GLTFLoader();
// Ruta corregida según tu estructura en assets
loader.load('./assets/collision-world.glb', (gltf) => {
    scene.add(gltf.scene);
    worldOctree.fromGraphNode(gltf.scene);
    gltf.scene.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    animate();
});

// --- LÓGICA DE ACTUALIZACIÓN ---
function updatePlayer(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1;
    if (!playerOnFloor) {
        playerVelocity.y -= 30 * deltaTime;
        damping = Math.exp(-1.5 * deltaTime) - 1;
    }
    playerVelocity.addScaledVector(playerVelocity, damping);
    playerCapsule.translate(playerVelocity.clone().multiplyScalar(deltaTime));
    
    const result = worldOctree.capsuleIntersect(playerCapsule);
    playerOnFloor = false;
    if (result) {
        playerOnFloor = result.normal.y > 0;
        playerCapsule.translate(result.normal.multiplyScalar(result.depth));
    }
    camera.position.copy(playerCapsule.end);
}

function updateFireballs(deltaTime) {
    fireballs.forEach((ball, index) => {
        ball.velocity.y -= 5 * deltaTime;
        ball.mesh.position.addScaledVector(ball.velocity, deltaTime);
        const result = worldOctree.sphereIntersect(ball.collider);
        if (result) {
            ball.velocity.addScaledVector(result.normal, -result.normal.dot(ball.velocity) * 1.5);
            ball.mesh.position.addScaledVector(result.normal, result.depth);
        }
    });
    if (fireballs.length > 20) {
        const b = fireballs.shift();
        scene.remove(b.mesh);
    }
}

function animate() {
    const deltaTime = Math.min(0.05, clock.getDelta());
    
    const speed = playerOnFloor ? 25 : 8;
    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0; playerDirection.normalize();
    const sideDir = new THREE.Vector3().crossVectors(camera.up, playerDirection).negate();

    if (keyStates['KeyW']) playerVelocity.addScaledVector(playerDirection, speed * deltaTime);
    if (keyStates['KeyS']) playerVelocity.addScaledVector(playerDirection, -speed * deltaTime);
    if (keyStates['KeyA']) playerVelocity.addScaledVector(sideDir, -speed * deltaTime);
    if (keyStates['KeyD']) playerVelocity.addScaledVector(sideDir, speed * deltaTime);
    if (playerOnFloor && keyStates['Space']) playerVelocity.y = 15;

    updatePlayer(deltaTime);
    updateFireballs(deltaTime);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}