import * as THREE from 'three';

// Original, procedural storybook characters. The friendly proportions and
// silhouettes stay readable even when the world is viewed on a small screen.
const sphere = new THREE.SphereGeometry(1, 20, 14);
const capsule = new THREE.CapsuleGeometry(.1, .3, 5, 10);

function material(color, extras = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .83, metalness: 0, ...extras });
}
function ball(parent, mat, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(sphere, mat);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function limb(parent, mat, length, radius, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 5, 10), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function smile(parent, mat, y, z, width = .13) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-width, y + .035, z),
    new THREE.Vector3(0, y, z + .015),
    new THREE.Vector3(width, y + .035, z),
  ]);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, .016, 5, false), mat);
  parent.add(mesh);
}
function eyes(parent, white, dark, glint, y, z, separation = .19, size = .125) {
  for (const side of [-1, 1]) {
    ball(parent, white, [side * separation, y, z], [size * 1.1, size * 1.25, size * .62]);
    ball(parent, dark, [side * separation, y, z + size * .48], [size * .77, size * .94, size * .42]);
    ball(parent, glint, [side * separation - size * .22, y + size * .32, z + size * .83], [size * .21, size * .21, size * .1]);
  }
}

export function createRosalie({ ghost = false } = {}) {
  const group = new THREE.Group();
  group.name = ghost ? 'Rosalie moonprint' : 'Rosalie';
  const ghostOptions = ghost ? { transparent: true, opacity: .45, emissive: 0x71dbe6, emissiveIntensity: .5, depthWrite: false } : {};
  const skin = material(ghost ? '#a5ebed' : '#dba67f', ghostOptions);
  const hair = material(ghost ? '#6cc7dc' : '#472b27', ghostOptions);
  const hairLight = material(ghost ? '#a9e9f6' : '#684333', ghostOptions);
  const dress = material(ghost ? '#67bed5' : '#628c64', ghostOptions);
  const dressLight = material(ghost ? '#9cdbde' : '#9eb88c', ghostOptions);
  const cream = material('#f3e4c3', ghostOptions);
  const boots = material(ghost ? '#a6e1eb' : '#aa6449', ghostOptions);
  const dark = material('#272735', ghostOptions);
  const white = material('#fff8e9', ghostOptions);
  const blush = material(ghost ? '#a5e9ee' : '#d68170', ghostOptions);
  const body = new THREE.Group();
  group.add(body);
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(.37, .58, 12), dress);
  skirt.position.y = .7;
  skirt.castShadow = true;
  body.add(skirt);
  ball(body, dressLight, [0, .96, 0], [.25, .25, .2]);
  ball(body, cream, [0, .79, .185], [.18, .25, .035]);
  ball(body, dress, [0, .88, .23], [.07, .06, .014]);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * .145, .46, 0);
    limb(leg, cream, .24, .085, 0, -.16, 0);
    ball(leg, boots, [0, -.35, .055], [.12, .1, .18]);
    body.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * .27, 1.03, 0);
    limb(arm, cream, .1, .1, side * .015, -.08, 0);
    limb(arm, skin, .18, .071, side * .035, -.27, .015);
    ball(arm, skin, [side * .04, -.42, .02], [.085, .09, .08]);
    arm.rotation.z = -side * .13;
    body.add(arm);
    arms.push(arm);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.49, .015);
  body.add(head);
  ball(head, hair, [0, .05, -.035], [.43, .45, .37]);
  ball(head, skin, [0, -.01, .08], [.365, .39, .32]);
  for (const side of [-1, 1]) ball(head, skin, [side * .37, -.025, .07], [.085, .12, .07]);
  eyes(head, white, dark, white, .055, .354, .155, .104);
  ball(head, skin, [0, -.045, .4], [.064, .061, .055]);
  for (const side of [-1, 1]) ball(head, blush, [side * .24, -.09, .335], [.075, .038, .015]);
  smile(head, dark, -.16, .359, .08);
  // A deliberately asymmetric crown of curls and a recognizable high bun.
  for (let i = 0; i < 17; i++) {
    const a = (i / 17) * Math.PI * 2;
    const x = Math.sin(a) * .33;
    const y = .22 + Math.cos(a) * .18;
    const z = i < 10 ? .16 : -.15;
    ball(head, i % 3 === 0 ? hairLight : hair, [x, y, z], [.115, .115 + (i % 3) * .018, .12]);
  }
  ball(head, hair, [.055, .48, -.05], [.255, .23, .235]);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399;
    ball(head, i % 3 === 0 ? hairLight : hair, [Math.sin(a) * .18 + .055, .46 + (i % 3) * .075, Math.cos(a) * .17 - .05], [.106, .1, .108]);
  }
  ball(head, dressLight, [.2, .395, .03], [.11, .065, .045]);
  const bag = ball(body, boots, [-.22, .65, -.15], [.16, .2, .12]);
  if (ghost) group.traverse(obj => { if (obj.isMesh) obj.castShadow = false; });
  return {
    group,
    update(time, { moving = false, reducedMotion = false } = {}) {
      const stride = moving && !reducedMotion ? Math.sin(time * 9) : 0;
      legs[0].rotation.x = stride * .42;
      legs[1].rotation.x = -stride * .42;
      arms[0].rotation.x = -stride * .3;
      arms[1].rotation.x = stride * .3;
      body.position.y = moving && !reducedMotion ? Math.abs(Math.sin(time * 9)) * .035 : 0;
      head.rotation.z = !moving && !reducedMotion ? Math.sin(time * .8) * .025 : 0;
      bag.rotation.z = stride * .035;
    },
  };
}

export function createMoon({ echo = false } = {}) {
  const group = new THREE.Group();
  group.name = echo ? 'Remembered moonlight' : 'Little Moon';
  const core = material(echo ? '#96ebe4' : '#d1f7ef', { emissive: echo ? '#499f9a' : '#79b7b6', emissiveIntensity: .65, roughness: .35 });
  const white = material('#ffffff', { emissive: '#e6ffff', emissiveIntensity: .25 });
  const dark = material('#26344c');
  const pink = material('#d599ac', { emissive: '#b3598a', emissiveIntensity: .16 });
  const inner = new THREE.Group();
  group.add(inner);
  ball(inner, core, [0, 0, 0], [.43, .43, .43]);
  const glowMat = new THREE.MeshBasicMaterial({ color: echo ? '#8bfff0' : '#9ae5ef', transparent: true, opacity: .10, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
  ball(inner, glowMat, [0, 0, 0], [.57, .57, .57]);
  eyes(inner, white, dark, white, .045, .365, .16, .102);
  for (const side of [-1, 1]) {
    ball(inner, pink, [side * .26, -.09, .33], [.066, .035, .02]);
    ball(inner, core, [side * .43, -.08, .02], [.12, .055, .085]);
  }
  smile(inner, dark, -.14, .399, .075);
  const sparkleMat = new THREE.MeshBasicMaterial({ color: '#fff2b4' });
  const sparkles = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const sparkle = new THREE.Mesh(new THREE.OctahedronGeometry(.045 + i * .009), sparkleMat);
    const a = i * Math.PI * 2 / 3;
    sparkle.position.set(Math.sin(a) * .66, (i - 1) * .23, Math.cos(a) * .55);
    sparkles.add(sparkle);
  }
  inner.add(sparkles);
  const light = new THREE.PointLight(echo ? 0x95ffe2 : 0xb6eeef, 1.5, 4.5, 2);
  light.position.y = .2;
  group.add(light);
  group.traverse(obj => { if (obj.isMesh) obj.castShadow = false; });
  return {
    group,
    update(time, { reducedMotion = false } = {}) {
      inner.position.y = reducedMotion ? 0 : Math.sin(time * 1.8) * .07;
      sparkles.rotation.y = reducedMotion ? 0 : time * .45;
    },
  };
}

export function createLily() {
  const group = new THREE.Group();
  group.name = 'Lily';
  const cream = material('#f1e8cc');
  const brown = material('#a46e4d');
  const hoof = material('#5d5147');
  const pink = material('#dfa19b');
  const dark = material('#293039');
  const white = material('#fff9e9');
  const green = material('#758d59');
  ball(group, cream, [0, .58, -.08], [.52, .48, .76]);
  ball(group, brown, [-.35, .7, -.12], [.19, .3, .31]);
  ball(group, brown, [.34, .7, -.47], [.2, .25, .24]);
  for (const x of [-.3, .3]) for (const z of [-.49, .3]) {
    limb(group, cream, .28, .11, x, .24, z);
    ball(group, hoof, [x, .07, z + .025], [.13, .09, .15]);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.08, .48);
  group.add(head);
  ball(head, cream, [0, 0, 0], [.4, .43, .37]);
  ball(head, brown, [-.24, .14, .15], [.16, .23, .21]);
  ball(head, pink, [0, -.17, .3], [.34, .2, .2]);
  eyes(head, white, dark, white, .055, .31, .17, .09);
  for (const side of [-1, 1]) {
    const ear = ball(head, cream, [side * .43, .12, -.01], [.23, .11, .1]);
    ear.rotation.z = side * .25;
    ball(head, pink, [side * .44, .13, .055], [.15, .055, .02]);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(.065, .22, 9), cream);
    horn.position.set(side * .25, .4, -.04);
    horn.rotation.z = side * .23;
    head.add(horn);
    ball(head, brown, [side * .13, -.17, .485], [.035, .025, .016]);
  }
  smile(head, brown, -.265, .45, .09);
  for (let i = 0; i < 5; i++) {
    const a = i * .65 - 1.3;
    const x = Math.sin(a) * .3;
    const z = Math.cos(a) * .18;
    ball(head, green, [x, .37, z], [.13, .035, .07]);
    ball(head, i % 2 ? pink : white, [x, .41, z], [.075, .06, .075]);
    ball(head, material('#e9bd65'), [x, .46, z], [.025, .02, .025]);
  }
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, .83, -.72), new THREE.Vector3(.12, .61, -.93), new THREE.Vector3(.19, .43, -.93)]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, .035, 6, false), cream));
  ball(group, brown, [.19, .43, -.93], [.06, .1, .06]);
  return { group, update(time, { reducedMotion = false } = {}) { head.rotation.z = reducedMotion ? 0 : Math.sin(time * .8) * .04; } };
}

export function createMono() {
  const group = new THREE.Group();
  group.name = 'Mono';
  const brown = material('#9c6346');
  const darkBrown = material('#78503e');
  const cream = material('#e4b98b');
  const dark = material('#293039');
  const white = material('#fff8e7');
  const scarf = material('#e6ae58');
  ball(group, brown, [0, .69, 0], [.29, .42, .22]);
  ball(group, cream, [0, .67, .17], [.2, .28, .06]);
  for (const side of [-1, 1]) {
    const arm = limb(group, brown, .42, .09, side * .31, .65, 0);
    arm.rotation.z = side * .2;
    ball(group, cream, [side * .36, .37, .04], [.105, .11, .1]);
    limb(group, brown, .24, .09, side * .15, .25, 0);
    ball(group, cream, [side * .15, .07, .07], [.13, .08, .18]);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.23, 0);
  group.add(head);
  ball(head, brown, [0, 0, 0], [.38, .38, .32]);
  for (const side of [-1, 1]) {
    ball(head, brown, [side * .39, -.01, 0], [.16, .19, .1]);
    ball(head, cream, [side * .41, -.01, .075], [.1, .13, .035]);
    ball(head, cream, [side * .13, .02, .22], [.18, .24, .15]);
  }
  ball(head, cream, [0, -.13, .24], [.26, .17, .15]);
  eyes(head, white, dark, white, .04, .337, .14, .085);
  ball(head, darkBrown, [0, -.06, .39], [.06, .04, .025]);
  smile(head, darkBrown, -.17, .369, .1);
  for (let i = 0; i < 3; i++) ball(head, brown, [(i - 1) * .085, .36 + i * .015, -.01], [.085, .1, .07]);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.205, .045, 7, 20), scarf);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = .94;
  group.add(collar);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .58, -.2), new THREE.Vector3(.27, .6, -.56),
    new THREE.Vector3(.55, 1, -.57), new THREE.Vector3(.42, 1.2, -.5), new THREE.Vector3(.3, 1.09, -.43),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 24, .055, 7, false), brown));
  return { group, update(time, { reducedMotion = false } = {}) { head.rotation.z = reducedMotion ? 0 : Math.sin(time * 1.15 + 1) * .065; } };
}
