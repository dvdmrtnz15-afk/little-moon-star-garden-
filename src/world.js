import * as THREE from 'three';
import { createRosalie, createMoon, createLily, createMono } from './characters.js';

const PALETTE = {
  sky: '#091d2c', water: '#155965', grass: '#83a982', grassLight: '#adc298',
  earth: '#745c51', earthLight: '#b48c6c', path: '#d4c4a0', trunk: '#765543',
  leaf: '#466e59', leafLight: '#719374', gold: '#f5d692', mint: '#9ae4d4',
  pink: '#e3a99d', stone: '#babba4', purple: '#ac9cb8', cream: '#f6ebd2',
};
const UP = new THREE.Vector3(0, 1, 0);

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function mat(color, extras = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .88, metalness: 0, ...extras });
}
const shared = {
  sphere: new THREE.SphereGeometry(1, 12, 8),
  rock: new THREE.DodecahedronGeometry(1, 0),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 10),
  box: new THREE.BoxGeometry(1, 1, 1),
};

function mesh(parent, geometry, material, x = 0, y = 0, z = 0, scale) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  if (scale) item.scale.set(...scale);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}
function sphere(parent, material, x, y, z, scale) { return mesh(parent, shared.sphere, material, x, y, z, scale); }
function cylinder(parent, material, x, y, z, radius, height) { return mesh(parent, shared.cylinder, material, x, y, z, [radius, height, radius]); }
function box(parent, material, x, y, z, scale) { return mesh(parent, shared.box, material, x, y, z, scale); }
function tube(parent, points, radius, material, segments = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(parent, new THREE.TubeGeometry(curve, segments, radius, 6, false), material);
}
function starGeometry(radius = .45, depth = .16) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 ? radius * .47 : radius;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .04, bevelThickness: .035 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
function path(parent, points, width, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, .055, z)));
  const positions = [], uvs = [], indices = [];
  const n = 50;
  for (let i = 0; i <= n; i++) {
    const p = curve.getPoint(i / n), tangent = curve.getTangent(i / n);
    const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize().multiplyScalar(width / 2);
    positions.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
    uvs.push(0, i / n, 1, i / n);
    if (i < n) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const ribbon = mesh(parent, geometry, material);
  ribbon.castShadow = false;
  return ribbon;
}
function roundedShape(x0, x1, z0, z1, radius = .7) {
  // Shape coordinates become world x/z after rotating the extrusion.
  const shape = new THREE.Shape();
  const y0 = -z1, y1 = -z0, r = radius;
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x1 - r, y0); shape.quadraticCurveTo(x1, y0, x1, y0 + r);
  shape.lineTo(x1, y1 - r); shape.quadraticCurveTo(x1, y1, x1 - r, y1);
  shape.lineTo(x0 + r, y1); shape.quadraticCurveTo(x0, y1, x0, y1 - r);
  shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  return shape;
}

function makeIsland(parent, bounds, materials) {
  const [x0, x1, z0, z1] = bounds;
  const shape = roundedShape(x0, x1, z0, z1, .45);
  const ground = mesh(parent, new THREE.ExtrudeGeometry(shape, { depth: .35, bevelEnabled: true, bevelSegments: 2, bevelSize: .15, bevelThickness: .1, steps: 1 }), materials.grass);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.36;
  ground.name = 'Walkable island';
  const foundation = mesh(parent, new THREE.ExtrudeGeometry(roundedShape(x0 - .12, x1 + .12, z0 - .12, z1 + .12, .7), { depth: 1.25, bevelEnabled: true, bevelSegments: 2, bevelSize: .25, bevelThickness: .2, steps: 1 }), materials.earth);
  foundation.rotation.x = -Math.PI / 2;
  foundation.position.y = -1.7;
  const trim = mesh(parent, new THREE.ExtrudeGeometry(roundedShape(x0 - .12, x1 + .12, z0 - .12, z1 + .12, .6), { depth: .27, bevelEnabled: true, bevelSegments: 1, bevelSize: .12, bevelThickness: .08, steps: 1 }), materials.earthLight);
  trim.rotation.x = -Math.PI / 2;
  trim.position.y = -.78;
  return ground;
}

function createFlora(parent, locations, seed = 1) {
  const random = rng(seed);
  const petals = [], centers = [], stems = [], leaves = [], grass = [];
  const petalColors = ['#e3a293', '#f0dba3', '#b1c7cf', '#bcafcb', '#eec9b8'];
  for (const [cx, cz, count = 8, spread = 1] of locations) {
    for (let n = 0; n < count; n++) {
      const a = random() * Math.PI * 2, r = Math.sqrt(random()) * spread;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const h = .17 + random() * .28, size = .07 + random() * .055;
      const color = petalColors[Math.floor(random() * petalColors.length)];
      stems.push({ p: [x, h / 2, z], s: [.018, h, .018] });
      centers.push({ p: [x, h + .035, z], s: [size * .46, size * .38, size * .46], c: '#f7cb68' });
      for (let k = 0; k < 5; k++) {
        const pa = k * Math.PI * 2 / 5;
        petals.push({ p: [x + Math.cos(pa) * size * .75, h, z + Math.sin(pa) * size * .75], s: [size * .7, size * .33, size * .7], c: color });
      }
      leaves.push({ p: [x + .045, h * .45, z], s: [.09, .023, .045], rz: .4 });
      if (n % 2 === 0) grass.push({ p: [x + .15, .11, z - .1], s: [.07, .21, .07] });
    }
  }
  function instances(items, geometry, material) {
    const batch = new THREE.InstancedMesh(geometry, material, items.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      dummy.position.set(...item.p); dummy.scale.set(...item.s); dummy.rotation.set(0, 0, item.rz || 0); dummy.updateMatrix();
      batch.setMatrixAt(i, dummy.matrix);
      if (item.c) batch.setColorAt(i, new THREE.Color(item.c));
    }
    batch.castShadow = false; batch.receiveShadow = true;
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    parent.add(batch);
  }
  instances(petals, shared.sphere, mat('#ffffff'));
  instances(centers, shared.sphere, mat('#ffffff'));
  instances(stems, shared.cylinder, mat('#557c54'));
  instances(leaves, shared.sphere, mat('#729564'));
  instances(grass, new THREE.ConeGeometry(1, 1, 3), mat('#628767'));
}

function tree(parent, x, z, scale, materials, variant = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); parent.add(group);
  const trunk = cylinder(group, materials.trunk, 0, 1.1, 0, .17, 2.2); trunk.rotation.z = .06;
  tube(group, [[0, 1.1, 0], [.45, 1.7, -.1], [.6, 2, -.1]], .075, materials.trunk, 8);
  tube(group, [[0, 1.4, 0], [-.35, 1.9, .1], [-.55, 2.1, .12]], .065, materials.trunk, 8);
  const leaves = variant === 1 ? materials.blushLeaf : variant === 2 ? materials.paleLeaf : materials.leaf;
  sphere(group, leaves, 0, 2.3, 0, [.95, .85, .8]);
  sphere(group, leaves, -.6, 2.02, .12, [.65, .65, .66]);
  sphere(group, leaves, .6, 2.14, -.1, [.68, .73, .63]);
  sphere(group, variant === 0 ? materials.leafLight : leaves, -.15, 2.8, .1, [.63, .5, .57]);
  if (variant === 1) for (let i = 0; i < 6; i++) {
    const a = i * 2.4;
    sphere(group, materials.gold, Math.sin(a) * .73, 2.2 + (i % 3) * .16, Math.cos(a) * .65, [.045, .055, .045]);
  }
  return group;
}
function lantern(parent, x, z, materials, height = .64) {
  cylinder(parent, materials.trunk, x, height / 2, z, .035, height);
  cylinder(parent, materials.wood, x, height + .03, z, .15, .07);
  const bulb = cylinder(parent, materials.lamp, x, height + .18, z, .105, .23);
  bulb.castShadow = false;
  const roof = mesh(parent, new THREE.ConeGeometry(.2, .15, 6), materials.roof, x, height + .36, z);
  roof.castShadow = false;
  return bulb;
}
function sign(parent, text, x, z, materials, angle = 0) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e6d2a5'; ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = '#b5966b'; ctx.lineWidth = 12; ctx.strokeRect(9, 9, 494, 142);
  ctx.fillStyle = '#3c5548'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 47px Georgia, serif'; ctx.fillText(text, 256, 82);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = angle; parent.add(group);
  cylinder(group, materials.trunk, 0, .49, 0, .06, .98);
  const board = box(group, materials.wood, 0, .91, 0, [1.45, .48, .1]);
  const face = mesh(group, new THREE.PlaneGeometry(1.4, .44), new THREE.MeshStandardMaterial({ map: texture, roughness: .9 }), 0, .91, .057);
  face.castShadow = false;
  return board;
}

function makeTreehouse(parent, materials) {
  const group = new THREE.Group(); group.position.set(-7.4, 0, -3.65); parent.add(group);
  cylinder(group, materials.trunk, 0, 2.4, 0, .5, 4.8);
  tube(group, [[0, 2.4, 0], [-1.5, 3.6, -.3], [-2.0, 4.8, -.4]], .19, materials.trunk, 12);
  tube(group, [[0, 2.8, 0], [1.15, 4.4, .3], [1.6, 5, .1]], .22, materials.trunk, 12);
  cylinder(group, materials.wood, 0, 2.1, .1, 1.7, .2);
  const house = cylinder(group, materials.house, 0, 3, -.1, 1.05, 1.65);
  const roof = mesh(group, new THREE.ConeGeometry(1.55, 1.5, 8), materials.roof, 0, 4.38, -.1);
  roof.rotation.y = Math.PI / 8;
  cylinder(group, materials.roof, 0, 3.69, -.1, 1.2, .17);
  for (const side of [-1, 1]) {
    const window = box(group, materials.lamp, side * .54, 3.05, .86, [.4, .57, .055]);
    window.castShadow = false;
    box(group, materials.trunk, side * .54, 3.05, .9, [.035, .63, .05]);
    box(group, materials.trunk, side * .54, 3.05, .9, [.46, .035, .05]);
  }
  box(group, materials.trunk, 0, 2.77, .94, [.39, .98, .12]);
  sphere(group, materials.gold, .11, 2.75, 1.015, [.035, .035, .03]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    cylinder(group, materials.trunk, Math.sin(a) * 1.5, 2.47, Math.cos(a) * 1.5 + .1, .035, .65);
  }
  const ring = mesh(group, new THREE.TorusGeometry(1.5, .035, 5, 24), materials.trunk, 0, 2.77, .1); ring.rotation.x = -Math.PI / 2;
  const ladder = new THREE.Group(); ladder.position.set(.5, .1, 1.6); ladder.rotation.x = -.28; group.add(ladder);
  for (const side of [-1, 1]) cylinder(ladder, materials.trunk, side * .3, .95, 0, .055, 2.1);
  for (let i = 0; i < 6; i++) box(ladder, materials.wood, 0, .22 + i * .31, .035, [.65, .08, .13]);
  const canopyPositions = [[-1.45, 5, -.1, 1.45], [.2, 5.6, -.45, 1.5], [1.5, 5.1, -.3, 1.25], [-.35, 5.1, -1.4, 1.3]];
  for (const [x, y, z, s] of canopyPositions) sphere(group, materials.leaf, x, y, z, [s, s * .6, s * .8]);
  sphere(group, materials.leafLight, -.45, 5.9, -.3, [1.1, .54, .75]);
  const stringPoints = [[-1.45, 4.6, .8], [-.6, 4.25, 1.2], [.3, 4.1, 1.25], [1.45, 4.6, .7]];
  tube(group, stringPoints, .012, materials.trunk, 24);
  for (let i = 0; i < 7; i++) {
    const x = -1.4 + i * .46;
    sphere(group, materials.lamp, x, 4.07 + .43 * (x * x / 2), 1.15, [.055, .075, .055]);
  }
  cylinder(group, materials.trunk, -1.9, .55, 1.3, .06, 1.1);
  mesh(group, starGeometry(.22, .07), materials.gold, -1.9, 1.18, 1.3);
  return group;
}

function makePortal(parent, x, z, materials, addPick) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = .25; parent.add(group);
  for (const side of [-1, 1]) {
    cylinder(group, materials.stone, side * .68, 1.1, 0, .2, 2.2);
    sphere(group, materials.leafLight, side * .71, 1.68, 0, [.36, .22, .29]);
  }
  const archPoints = [];
  for (let i = 0; i <= 18; i++) { const a = Math.PI - i * Math.PI / 18; archPoints.push([Math.cos(a) * .7, 1.8 + Math.sin(a) * .7, 0]); }
  tube(group, archPoints, .2, materials.stone, 24);
  const halo = mesh(group, new THREE.TorusGeometry(.8, .035, 6, 48), materials.magic, 0, 1.35, .05); halo.scale.y = 1.3;
  const inner = mesh(group, new THREE.PlaneGeometry(1.15, 1.8), new THREE.MeshBasicMaterial({ color: '#a7e3d7', transparent: true, opacity: .12, side: THREE.DoubleSide, depthWrite: false }), 0, 1.25, 0);
  inner.castShadow = false;
  mesh(group, starGeometry(.2, .08), materials.gold, 0, 2.68, .02);
  addPick('portal', x, z, .85, 2.7);
  return { group, halo };
}

function makeBasket(parent, x, z, materials) {
  const group = new THREE.Group(); group.position.set(x, 0, z); parent.add(group);
  const basket = mesh(group, new THREE.CylinderGeometry(.43, .31, .48, 14), materials.wood, 0, .28, 0);
  for (let i = 0; i < 3; i++) { const ring = mesh(group, new THREE.TorusGeometry(.34 + i * .035, .026, 5, 20), materials.trunk, 0, .13 + i * .15, 0); ring.rotation.x = Math.PI / 2; }
  tube(group, [[-.4, .43, 0], [-.32, .93, 0], [.32, .93, 0], [.4, .43, 0]], .035, materials.trunk, 24);
  return basket;
}

function makePad(parent, x, z, kind, materials, addPick) {
  const group = new THREE.Group(); group.position.set(x, 0, z); parent.add(group);
  cylinder(group, materials.stone, 0, .055, 0, .67, .13);
  const lightMaterial = mat(kind === 'ferry' ? '#ecd1a1' : '#bce0c9', { emissive: kind === 'ferry' ? '#997133' : '#467a64', emissiveIntensity: .35 });
  const ring = mesh(group, new THREE.TorusGeometry(.51, .038, 6, 40), lightMaterial, 0, .14, 0); ring.rotation.x = -Math.PI / 2;
  const rune = kind === 'ferry' ? mesh(group, starGeometry(.22, .018), lightMaterial, 0, .15, 0) : mesh(group, new THREE.TorusGeometry(.2, .04, 6, 24, Math.PI * 1.55), lightMaterial, 0, .15, 0);
  rune.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 4; i++) sphere(group, lightMaterial, Math.cos(i * Math.PI / 2) * .59, .12, Math.sin(i * Math.PI / 2) * .59, [.045, .025, .045]);
  addPick(kind + '-pad', x, z, .8, .35);
  return { group, lightMaterial, ring };
}

function makePond(parent, materials) {
  const group = new THREE.Group(); parent.add(group);
  const water = cylinder(group, materials.waterLight, 0, .08, 0, 1.13, .08); water.scale.z = .82;
  for (let i = 0; i < 13; i++) {
    const a = i * Math.PI * 2 / 13;
    const rock = mesh(group, shared.rock, materials.stone, Math.cos(a) * 1.16, .12, Math.sin(a) * .95, [.21, .16, .2]); rock.rotation.y = i;
  }
  for (const [x, z] of [[-.35, .1], [.43, -.22]]) {
    const leaf = cylinder(group, materials.leafLight, x, .15, z, .3, .03); leaf.scale.z = .8;
    sphere(group, materials.blushLeaf, x, .23, z, [.11, .1, .11]);
  }
  lantern(group, .95, .75, materials, .45);
  return group;
}
function makeArbor(parent, materials) {
  const group = new THREE.Group(); parent.add(group);
  for (const side of [-1, 1]) {
    cylinder(group, materials.trunk, side * .77, .91, 0, .085, 1.82);
    sphere(group, materials.leafLight, side * .78, 1.7, 0, [.48, .3, .35]);
    sphere(group, materials.blushLeaf, side * .6, 1.88, .06, [.18, .14, .2]);
  }
  tube(group, [[-.77, 1.75, 0], [0, 2.13, 0], [.77, 1.75, 0]], .09, materials.trunk, 16);
  sphere(group, materials.leafLight, 0, 2.07, 0, [.63, .25, .34]);
  mesh(group, starGeometry(.16, .06), materials.gold, 0, 1.7, .04);
  return group;
}

export function createWorld(container, options = {}) {
  const { onSelect = () => {}, onMove = () => {}, onReady = () => {}, onContextLost = () => {}, onContextRestored = () => {} } = options;
  let reducedMotion = Boolean(options.reducedMotion), disposed = false, contextLost = false, currentScene = 'garden';
  let time = 0, latestState = null, previousPosition = null, previousScene = null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.FogExp2('#102c39', .009);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'world-canvas';
  renderer.domElement.setAttribute('aria-label', 'The Star Garden: a three-dimensional storybook world. Use the nearby actions for keyboard and screen-reader access.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  container.appendChild(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-18, 18, 12, -12, .1, 180);
  camera.position.set(21, 28, 32);
  camera.lookAt(0, .1, -.4);
  const hemi = new THREE.HemisphereLight('#dcebe3', '#52604d', 2.5); scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffe4b4', 3.0); key.position.set(-8, 17, 8); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -18; key.shadow.camera.right = 18; key.shadow.camera.top = 16; key.shadow.camera.bottom = -16;
  key.shadow.camera.near = 1; key.shadow.camera.far = 55; key.shadow.bias = -.0005; key.shadow.normalBias = .035;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8ecad8', 1.3); rim.position.set(7, 9, -12); scene.add(rim);
  const materials = {
    grass: mat(PALETTE.grass), earth: mat(PALETTE.earth), earthLight: mat(PALETTE.earthLight), path: mat(PALETTE.path),
    trunk: mat(PALETTE.trunk), wood: mat('#b8966d'), leaf: mat(PALETTE.leaf), leafLight: mat(PALETTE.leafLight),
    blushLeaf: mat('#c99591'), paleLeaf: mat('#95b2a2'), stone: mat(PALETTE.stone), roof: mat('#5e7d6a'), house: mat('#d6c39b'),
    gold: mat(PALETTE.gold, { emissive: '#e8b75b', emissiveIntensity: .25 }),
    lamp: mat('#ffe4aa', { emissive: '#ffc875', emissiveIntensity: 2.2 }),
    magic: mat('#b9f2df', { emissive: '#7ac3b6', emissiveIntensity: 1.35 }),
    water: mat(PALETTE.water, { roughness: .36, metalness: .18, emissive: '#123d44', emissiveIntensity: .22 }),
    waterLight: mat('#5caba7', { roughness: .25, metalness: .12, emissive: '#2a6367', emissiveIntensity: .3 }),
  };
  const sea = mesh(scene, new THREE.PlaneGeometry(180, 180), materials.water, 0, -1.9, 0); sea.rotation.x = -Math.PI / 2; sea.castShadow = false; sea.receiveShadow = false;
  const garden = new THREE.Group(); garden.name = 'The Star Garden'; scene.add(garden);
  const stream = new THREE.Group(); stream.name = 'The Lantern Stream'; scene.add(stream); stream.visible = false;
  const sceneGroups = { garden, stream }, groundMeshes = { garden: [], stream: [] }, pickMeshes = { garden: [], stream: [] };
  const invisibleMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
  let buildingScene = 'garden';
  function addPick(id, x, z, radius = .65, height = 1) {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 8), invisibleMaterial);
    hit.position.set(x, height / 2, z); hit.userData.selectId = id;
    sceneGroups[buildingScene].add(hit); pickMeshes[buildingScene].push(hit);
    return hit;
  }
  groundMeshes.garden.push(makeIsland(garden, [-11, 11, -7, 7], materials));
  path(garden, [[-8, -2], [-6, .9], [-2, 2.8], [2, 3], [6, 2.7], [8, 2]], 1.1, materials.path);
  path(garden, [[-4, 0], [-3.6, 1.3], [-2, 2.8]], .8, materials.path);
  path(garden, [[0, 0], [.3, 1.8], [2, 3]], .8, materials.path);
  path(garden, [[4, 0], [4.6, 1.4], [6, 2.7]], .8, materials.path);
  makeTreehouse(garden, materials);
  const portal = makePortal(garden, 8, 2, materials, addPick);
  sign(garden, 'Lantern Stream', 8.6, 3.8, materials, .25);
  sign(garden, 'Our Star Garden', -5, 4.7, materials, .35);
  const gardenTrees = [[-9, 4.5, .9, 0], [-10, -1, .85, 0], [-4, -5.5, 1.15, 1], [1, -5.6, 1.1, 0], [5.5, -5.4, 1.05, 1], [9.2, -3.3, 1.05, 0], [10, 5, .75, 1]];
  for (const [x, z, s, v] of gardenTrees) tree(garden, x, z, s, materials, v);
  createFlora(garden, [[-10, 5.7, 16, .65], [-6.5, 2, 16, .9], [-7, -1, 8, .6], [-3, -3.8, 22, 1.15], [1.5, -3.6, 22, 1], [6.5, -3.1, 19, 1], [9.6, 1.9, 12, .45], [4.7, 5.3, 22, 1.1], [-1, 5.7, 24, 1], [-9.9, -5.7, 14, .5]], 274);
  for (const [x, z] of [[-4.8, 2.4], [-.4, 3.6], [3.1, 3.9], [6.9, 3.6], [-6.2, -.3]]) lantern(garden, x, z, materials);
  const plots = {};
  for (let i = 0; i < 3; i++) {
    const x = -4 + i * 4, group = new THREE.Group(); group.position.set(x, 0, 0); garden.add(group);
    const empty = new THREE.Group(); group.add(empty);
    const mulch = cylinder(empty, mat('#a69879'), 0, .035, 0, 1.12, .07); mulch.scale.z = .9;
    const ring = mesh(empty, new THREE.TorusGeometry(1.08, .045, 5, 36), materials.path, 0, .09, 0); ring.rotation.x = -Math.PI / 2; ring.scale.y = .9;
    for (let p = 0; p < 3; p++) sphere(empty, materials.leafLight, (p - 1) * .18, .13, 0, [.07, .14, .045]);
    const pond = makePond(group, materials), arbor = makeArbor(group, materials); pond.visible = false; arbor.visible = false;
    plots['plot-' + (i + 1)] = { empty, pond, arbor };
    addPick('plot-' + (i + 1), x, 0, 1.15, 1.4);
  }
  // A small log bench and a blanket make the starting space feel inhabited.
  const bench = cylinder(garden, materials.trunk, -3, .34, 4.6, .22, 1.8); bench.rotation.z = Math.PI / 2;
  box(garden, mat('#c49c7d'), -.2, .065, 4.9, [1.2, .035, .8]);
  makeBasket(garden, .05, 4.85, materials);

  buildingScene = 'stream';
  groundMeshes.stream.push(makeIsland(stream, [-11, -2.4, -7, 7], materials), makeIsland(stream, [2.4, 11, -7, 7], materials));
  const river = mesh(stream, new THREE.PlaneGeometry(4.75, 14.7), materials.waterLight, 0, -.34, 0); river.rotation.x = -Math.PI / 2; river.castShadow = false;
  const waterfall = mesh(stream, new THREE.PlaneGeometry(4.6, 1.5), new THREE.MeshStandardMaterial({ color: '#7bc4bc', transparent: true, opacity: .58, emissive: '#3b8b89', emissiveIntensity: .35, side: THREE.DoubleSide, roughness: .25 }), 0, -1.05, 7.15); waterfall.castShadow = false;
  path(stream, [[-9, 5.5], [-8, 2], [-8.6, 0], [-8.5, -2.2], [-8, -4.5], [-3, -4]], .87, materials.path);
  path(stream, [[-9, 3], [-7, 3.6], [-4.8, 3], [-3, 4]], .85, materials.path);
  path(stream, [[3, 4], [5.2, 3.5], [7.7, 1.8], [8, 0], [7, -2.6], [3, -4]], .93, materials.path);
  for (const [x, z, s, v] of [[-10, -5.3, .95, 0], [-6.7, -5.9, 1, 0], [-10.3, 1.2, .78, 1], [-4.1, .2, .75, 0], [-4, 6, .85, 1], [4, -6, 1.1, 0], [8.7, -5, 1.2, 1], [10.1, 3.6, 1, 0], [6.6, 5.9, 1, 1]]) tree(stream, x, z, s, materials, v);
  createFlora(stream, [[-10.3, 3.3, 14, .4], [-10.4, -2.2, 14, .4], [-5.7, 1.4, 18, .8], [-3.5, -1.8, 16, .55], [-5.5, 5.8, 16, .7], [4, .2, 24, .8], [8.7, 2.5, 18, .8], [9.8, -.8, 22, .65], [6.1, -3.1, 20, .7], [9.7, 5.7, 16, .6]], 577);
  for (const [x, z] of [[-10, 5.6], [-7.5, 3.7], [-7.8, -3.6], [-3.2, 4.6], [3.2, 4.6], [5.8, 2.5], [6.2, -2], [3.2, -4.6]]) lantern(stream, x, z, materials, .52);
  sign(stream, 'Home', -9.7, 6.35, materials, .3);
  addPick('home', -9, 5.5, .8, .8);
  const homeRing = mesh(stream, new THREE.TorusGeometry(.58, .04, 6, 32), materials.magic, -9, .09, 5.5); homeRing.rotation.x = -Math.PI / 2;
  makeBasket(stream, -9, 0, materials); addPick('star', -9, 0, .67, 1.4);
  const sleepingStar = mesh(stream, starGeometry(.33, .15), materials.lamp, -9, .88, 0); sleepingStar.rotation.y = .5;
  const pads = { ferry: makePad(stream, -9, 3, 'ferry', materials, addPick), canopy: makePad(stream, -9, -3, 'canopy', materials, addPick) };
  const lineMaterials = { ferry: mat('#d4be8e', { emissive: '#9f723d', emissiveIntensity: .2 }), canopy: mat('#abcbb2', { emissive: '#6a9580', emissiveIntensity: .2 }) };
  const ferryLine = path(stream, [[-8.4, 3], [-7.7, 2.65], [-6.2, 2.6], [-5.5, 3]], .055, lineMaterials.ferry);
  ferryLine.position.y = .07;
  const canopyLine = path(stream, [[-8.4, -3], [-7.5, -2.75], [-6.2, -2.9], [-5.4, -3]], .055, lineMaterials.canopy);
  canopyLine.position.y = .07;
  // Lily's shallow planting basin has actual water and a visible growing seed.
  const basin = new THREE.Group(); basin.position.set(-5, 0, 3); stream.add(basin);
  cylinder(basin, materials.stone, 0, .34, 0, .64, .56);
  cylinder(basin, materials.earth, 0, .64, 0, .51, .05);
  const basinWater = cylinder(basin, materials.waterLight, 0, .68, 0, .49, .035); basinWater.visible = false;
  const basinSeed = new THREE.Group(); basinSeed.position.y = .68; basin.add(basinSeed);
  cylinder(basinSeed, materials.leaf, 0, .21, 0, .025, .42);
  const leafA = sphere(basinSeed, materials.leafLight, -.14, .24, 0, [.19, .04, .1]); leafA.rotation.z = -.4;
  const leafB = sphere(basinSeed, materials.leafLight, .14, .32, .02, [.19, .04, .1]); leafB.rotation.z = .4;
  basinSeed.visible = false;
  addPick('basin', -5, 3, .82, 1.2);
  // Mono's workbench clearly displays the vine and its spool.
  const workbench = new THREE.Group(); workbench.position.set(-5, 0, -3); stream.add(workbench);
  box(workbench, materials.wood, 0, .55, 0, [1.13, .12, .7]);
  for (const x of [-.4, .4]) for (const z of [-.22, .22]) cylinder(workbench, materials.trunk, x, .25, z, .045, .5);
  const coil = mesh(workbench, new THREE.TorusGeometry(.18, .035, 6, 24), materials.leafLight, .15, .68, 0); coil.rotation.x = -Math.PI / 2;
  const coil2 = mesh(workbench, new THREE.TorusGeometry(.11, .035, 6, 24), materials.leafLight, .15, .72, 0); coil2.rotation.x = -Math.PI / 2;
  cylinder(workbench, materials.trunk, -.3, .76, .03, .07, .32);
  addPick('workbench', -5, -3, .8, 1.1);
  const ferryBoat = new THREE.Group(); ferryBoat.position.set(-2.8, -.035, 4); stream.add(ferryBoat);
  const ferryLeaf = cylinder(ferryBoat, materials.leafLight, 0, 0, 0, 1.04, .13); ferryLeaf.scale.z = .82;
  const ferryVein = path(ferryBoat, [[-.83, 0], [0, 0], [.83, 0]], .035, materials.grass); ferryVein.position.y = .025;
  for (const side of [-1, 1]) {
    const rimPoints = [];
    for (let i = 0; i <= 10; i++) { const a = i * Math.PI / 10; rimPoints.push([Math.cos(a), .11, side * Math.sin(a) * .8]); }
    tube(ferryBoat, rimPoints, .03, materials.leaf, 20);
  }
  sphere(ferryBoat, materials.blushLeaf, .6, .17, -.4, [.2, .13, .2]);
  sphere(ferryBoat, materials.gold, .6, .26, -.4, [.075, .055, .075]);
  lantern(ferryBoat, -.65, -.35, materials, .32);
  const canopyBridge = new THREE.Group(); stream.add(canopyBridge);
  for (let i = 0; i < 15; i++) {
    const x = -2.9 + i * 5.8 / 14, y = .14 + Math.sin(i / 14 * Math.PI) * .37;
    const plank = box(canopyBridge, materials.wood, x, y, -4, [.33, .095, 1]);
    plank.rotation.y = (i % 3 - 1) * .025;
  }
  for (const side of [-1, 1]) {
    const points = [];
    for (let i = 0; i <= 12; i++) points.push([-2.95 + i * 5.9 / 12, .35 + Math.sin(i / 12 * Math.PI) * .39, -4 + side * .58]);
    tube(canopyBridge, points, .055, materials.leaf, 32);
  }
  canopyBridge.visible = false;
  const bridgeSprout = tube(stream, [[-3, .15, -4], [-2.7, .7, -4.1], [-2.3, .9, -4]], .06, materials.leafLight, 16); bridgeSprout.visible = false;
  for (const [id, x, z] of [['dock-west', -2.8, 4], ['dock-east', 2.8, 4], ['canopy-west', -2.8, -4], ['canopy-east', 2.8, -4]]) {
    addPick(id, x, z, .65, .6);
    const ring = mesh(stream, new THREE.TorusGeometry(.43, .025, 5, 30), materials.path, x, .08, z); ring.rotation.x = -Math.PI / 2;
  }
  const nursery = new THREE.Group(); nursery.position.set(8, 0, 0); stream.add(nursery);
  cylinder(nursery, materials.stone, 0, .12, 0, 1.05, .24);
  cylinder(nursery, materials.earth, 0, .27, 0, .83, .05);
  const nurseryBud = new THREE.Group(); nursery.add(nurseryBud);
  cylinder(nurseryBud, materials.leaf, 0, .65, 0, .07, .8);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const petal = sphere(nurseryBud, materials.leafLight, Math.cos(a) * .38, .61, Math.sin(a) * .38, [.34, .08, .23]); petal.rotation.z = Math.cos(a) * .28;
  }
  const blossom = new THREE.Group(); blossom.position.y = 1.15; nursery.add(blossom);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    const petal = sphere(blossom, materials.gold, Math.cos(a) * .34, -.06, Math.sin(a) * .34, [.3, .16, .3]); petal.rotation.z = Math.sin(a) * .2;
  }
  sphere(blossom, materials.lamp, 0, .05, 0, [.25, .22, .25]);
  blossom.visible = false;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    sphere(nursery, materials.blushLeaf, Math.cos(a) * .95, .32, Math.sin(a) * .95, [.11, .15, .11]);
  }
  addPick('nursery', 8, 0, 1.1, 1.75);
  sign(stream, 'The Star Nursery', 8.4, -1.8, materials, .35);
  const lily = createLily(); lily.group.position.set(-5.8, .08, 4.25); lily.group.rotation.y = .35; stream.add(lily.group);
  const mono = createMono(); mono.group.position.set(-6.2, .08, -3.7); mono.group.rotation.y = .5; stream.add(mono.group);
  addPick('basin', -5.8, 4.25, .65, 1.7); addPick('workbench', -6.2, -3.7, .6, 1.8);

  // Instanced river glints and a distant starfield provide motion without a
  // post-processing dependency or network-delivered assets.
  const random = rng(8512), starPositions = [];
  for (let i = 0; i < 260; i++) starPositions.push((random() - .5) * 120, 7 + random() * 36, -18 - random() * 55);
  const starFieldGeometry = new THREE.BufferGeometry(); starFieldGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(starFieldGeometry, new THREE.PointsMaterial({ color: '#ffecc3', size: .12, sizeAttenuation: true, transparent: true, opacity: .8, depthWrite: false })); scene.add(starField);
  const moonBackdrop = sphere(scene, new THREE.MeshBasicMaterial({ color: '#d5dfc8', transparent: true, opacity: .45 }), -16, 8, -26, [3.1, 3.1, 3.1]); moonBackdrop.castShadow = false;
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group(); cloud.position.set(-23 + i * 9, 1.5 + (i % 2) * 2.5, -18 - (i % 3) * 4); scene.add(cloud);
    const cloudMaterial = new THREE.MeshBasicMaterial({ color: '#56747b', transparent: true, opacity: .25, depthWrite: false });
    for (let k = 0; k < 4; k++) { const puff = sphere(cloud, cloudMaterial, k * 1.2, Math.sin(k) * .2, 0, [1.6, .45 + (k % 2) * .35, .75]); puff.castShadow = false; }
  }
  const glints = [];
  const glintMaterial = new THREE.MeshBasicMaterial({ color: '#c8f5df', transparent: true, opacity: .32, depthWrite: false });
  for (let i = 0; i < 22; i++) {
    const glint = mesh(stream, new THREE.PlaneGeometry(.12 + random() * .35, .018), glintMaterial, (random() - .5) * 4.25, -.315, (random() - .5) * 14);
    glint.rotation.x = -Math.PI / 2; glint.castShadow = false; glint.userData.baseZ = glint.position.z; glints.push(glint);
  }
  const fireflyPositions = [], fireflyBases = [];
  for (let i = 0; i < 42; i++) { const p = [(random() - .5) * 21, .4 + random() * 3, (random() - .5) * 13]; fireflyPositions.push(...p); fireflyBases.push(p); }
  const fireflyGeometry = new THREE.BufferGeometry(); fireflyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fireflyPositions, 3));
  const fireflies = new THREE.Points(fireflyGeometry, new THREE.PointsMaterial({ color: '#ffe3a0', size: .065, transparent: true, opacity: .85, depthWrite: false })); scene.add(fireflies);

  const rosalie = createRosalie(); scene.add(rosalie.group);
  const littleMoon = createMoon(); scene.add(littleMoon.group);
  const rememberedMoon = createMoon({ echo: true }); rememberedMoon.group.scale.setScalar(.74); stream.add(rememberedMoon.group); rememberedMoon.group.visible = false;
  const carriedStar = mesh(scene, starGeometry(.23, .1), materials.lamp, 0, 1.4, 0); carriedStar.visible = false; carriedStar.castShadow = false;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let pointerDown = null;
  function handleDown(event) { pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId }; }
  function handleUp(event) {
    if (disposed || contextLost || !pointerDown || event.pointerId !== pointerDown.id || (latestState && latestState.paused)) return;
    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y); pointerDown = null;
    if (distance > 10) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const picks = raycaster.intersectObjects(pickMeshes[currentScene], false);
    if (picks.length) { onSelect(picks[0].object.userData.selectId); return; }
    const ground = raycaster.intersectObjects(groundMeshes[currentScene], false);
    if (ground.length) onMove({ x: ground[0].point.x, z: ground[0].point.z });
  }
  function handleLost(event) { event.preventDefault(); contextLost = true; onContextLost(); }
  function handleRestored() { contextLost = false; onContextRestored(); }
  renderer.domElement.addEventListener('pointerdown', handleDown);
  renderer.domElement.addEventListener('pointerup', handleUp);
  renderer.domElement.addEventListener('webglcontextlost', handleLost, false);
  renderer.domElement.addEventListener('webglcontextrestored', handleRestored, false);

  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight), aspect = width / height;
    renderer.setSize(width, height, false);
    // On phones, the world remains completely framed above the conversation
    // panel. Horizontal input stays relative to the same real world axes.
    const halfHeight = Math.max(10.8, 15.4 / aspect);
    camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect; camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.setViewOffset(width, height, 0, height * .035, width, height);
    camera.updateProjectionMatrix();
  }
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  window.addEventListener('resize', resize);
  resize();
  let actorYaw = .55;
  function render(state = {}, dt = 1 / 60) {
    if (disposed || contextLost) return;
    latestState = state;
    const delta = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .1));
    if (!state.paused) time += delta;
    currentScene = state.scene === 'stream' ? 'stream' : 'garden';
    garden.visible = currentScene === 'garden'; stream.visible = currentScene === 'stream';
    const x = Number.isFinite(state.player?.x) ? state.player.x : -2, z = Number.isFinite(state.player?.z) ? state.player.z : 3;
    if (previousScene !== currentScene) previousPosition = null;
    const dx = previousPosition ? x - previousPosition.x : 0, dz = previousPosition ? z - previousPosition.z : 0;
    const travelling = !state.paused && Math.hypot(dx, dz) > .0005;
    const moving = travelling && state.traversal?.route !== 'ferry';
    if (travelling) {
      const targetYaw = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(targetYaw - actorYaw), Math.cos(targetYaw - actorYaw));
      actorYaw += diff * Math.min(1, delta * 13);
    }
    let actorY = .09;
    if (currentScene === 'stream' && Math.abs(x) < 2.9 && z < -2.8 && state.canopy?.complete) actorY += Math.max(0, Math.sin((x + 2.9) / 5.8 * Math.PI)) * .43;
    rosalie.group.position.set(x, actorY, z); rosalie.group.rotation.y = actorYaw;
    rosalie.update(time, { moving, reducedMotion });
    littleMoon.group.position.set(x + .82, actorY + 1.66, z + .07); littleMoon.group.rotation.y = .55; littleMoon.update(time, { reducedMotion });
    carriedStar.visible = state.star === 'carried'; carriedStar.position.set(x - .65, actorY + 1.35, z + .1); carriedStar.rotation.y = .55 + (reducedMotion ? 0 : Math.sin(time) * .15);
    sleepingStar.visible = state.star === 'basket' || !state.star;
    sleepingStar.position.y = .88 + (reducedMotion ? 0 : Math.sin(time * 1.8) * .055);
    lily.update(time, { reducedMotion }); mono.update(time, { reducedMotion });
    for (const kind of ['ferry', 'canopy']) {
      const pad = pads[kind], padZ = kind === 'ferry' ? 3 : -3;
      const active = currentScene === 'stream' && (Math.hypot(x + 9, z - padZ) <= .8 || state.moonprint?.receiver === kind);
      pad.lightMaterial.emissiveIntensity = active ? 1.8 : .23;
      lineMaterials[kind].emissiveIntensity = active ? 1.45 : .16;
      pad.ring.scale.setScalar(active && !reducedMotion ? 1 + Math.sin(time * 2) * .035 : 1);
    }
    rememberedMoon.group.visible = Boolean(state.moonprint);
    if (state.moonprint) {
      const receiver = state.moonprint.receiver;
      rememberedMoon.group.position.set(Number.isFinite(state.moonprint.x) ? state.moonprint.x : -9, 1.0, Number.isFinite(state.moonprint.z) ? state.moonprint.z : receiver === 'ferry' ? 3 : -3);
      rememberedMoon.group.rotation.y = .55; rememberedMoon.update(time, { reducedMotion });
    }
    basinWater.visible = Boolean(state.ferry?.prepared);
    basinSeed.visible = Boolean(state.ferry?.planted);
    const ferryGrowth = state.ferry?.complete ? 1 : Math.min(1, Math.max(0, Number(state.ferry?.growth) || 0));
    basinSeed.scale.setScalar(.4 + ferryGrowth * 1.1);
    ferryBoat.visible = ferryGrowth > .015;
    ferryBoat.scale.setScalar(Math.max(.01, ferryGrowth));
    const ferryDockX = state.ferry?.dock === 'east' ? 2.8 : -2.8;
    ferryBoat.position.set(state.traversal?.route === 'ferry' ? x : ferryDockX, -.035, 4);
    const canopyProgress = state.canopy?.complete ? 1 : Math.min(1, Math.max(0, Number(state.canopy?.progress) || 0));
    canopyBridge.visible = Boolean(state.canopy?.complete);
    bridgeSprout.visible = Boolean(state.canopy?.vinePlaced) && !state.canopy?.complete;
    bridgeSprout.scale.setScalar(.5 + canopyProgress * .8);
    coil.visible = !state.canopy?.vinePlaced; coil2.visible = !state.canopy?.vinePlaced;
    blossom.visible = state.star === 'nest';
    blossom.rotation.y = reducedMotion ? 0 : Math.sin(time * .3) * .05;
    const placements = state.garden?.placements || {};
    for (const [id, parts] of Object.entries(plots)) {
      const kind = placements[id]; parts.empty.visible = !kind; parts.pond.visible = kind === 'pond'; parts.arbor.visible = kind === 'arbor';
    }
    portal.halo.material.emissiveIntensity = reducedMotion ? 1.2 : 1.2 + Math.sin(time) * .15;
    for (let i = 0; i < glints.length; i++) glints[i].position.z = reducedMotion ? glints[i].userData.baseZ : ((glints[i].userData.baseZ + time * .28 + 7) % 14) - 7;
    fireflies.visible = !reducedMotion;
    if (!reducedMotion) {
      const positions = fireflyGeometry.attributes.position;
      for (let i = 0; i < fireflyBases.length; i++) {
        const base = fireflyBases[i]; positions.setXYZ(i, base[0] + Math.sin(time * .3 + i) * .18, base[1] + Math.sin(time * .5 + i * 3) * .2, base[2] + Math.cos(time * .25 + i) * .15);
      }
      positions.needsUpdate = true;
    }
    previousPosition = { x, z }; previousScene = currentScene;
    renderer.render(scene, camera);
  }
  function project(x, z, y = .2) {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return { x: (p.x + 1) / 2 * container.clientWidth, y: (1 - p.y) / 2 * container.clientHeight, visible: p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 };
  }
  function getInfo() {
    const gl = renderer.getContext();
    return { renderer: 'WebGL', engine: 'Three.js', webglVersion: contextLost ? 'context lost' : gl.getParameter(gl.VERSION), contextLost, scene: currentScene, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() };
  }
  function dispose() {
    if (disposed) return;
    disposed = true; resizeObserver?.disconnect(); window.removeEventListener('resize', resize);
    renderer.domElement.removeEventListener('pointerdown', handleDown); renderer.domElement.removeEventListener('pointerup', handleUp);
    renderer.domElement.removeEventListener('webglcontextlost', handleLost); renderer.domElement.removeEventListener('webglcontextrestored', handleRestored);
    const geometries = new Set(), mats = new Set(), textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) { mats.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); }
    });
    geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    renderer.dispose(); renderer.domElement.remove();
  }
  queueMicrotask(() => { if (!disposed) onReady(getInfo()); });
  return { render, resize, dispose, setReducedMotion(value) { reducedMotion = Boolean(value); }, project, getInfo };
}
