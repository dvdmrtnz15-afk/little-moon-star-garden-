import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, dispatch, advance, getAvailableActions, getLightState,
  getUnlockedRewards, getPlayerBank, getObjective, serialize, parseSave,
  WORLD, LIGHT_RECEIVERS, INTERACTION_RADIUS, HISTORY_LIMIT,
} from '../src/engine.js';

function command(state, input) {
  const result = dispatch(state, input);
  assert.equal(result.accepted, true, `${JSON.stringify(input)}: ${result.feedback}`);
  return result.state;
}

function interact(state, actionId) {
  return command(state, { type: 'INTERACT', actionId });
}

function walk(state, targetIdOrPoint) {
  const destination = typeof targetIdOrPoint === 'string'
    ? WORLD[state.scene].landmarks[targetIdOrPoint]
    : targetIdOrPoint;
  state = command(state, typeof targetIdOrPoint === 'string'
    ? { type: 'MOVE_TO', targetId: targetIdOrPoint }
    : { type: 'MOVE_TO', ...targetIdOrPoint });
  let frames = 0;
  while (state.player.target && frames++ < 600) state = advance(state, 0.1);
  assert.ok(frames < 600, 'ordinary movement reaches its destination');
  assert.ok(Math.hypot(state.player.x - destination.x, state.player.z - destination.z) < 0.0001);
  return state;
}

function begin({ pickUp = true } = {}) {
  let state = createInitialState();
  state = walk(state, 'portal');
  state = interact(state, 'enter-stream');
  if (pickUp) state = interact(state, 'pick-up-star');
  return state;
}

function buildRoute(state, route, { finish = true } = {}) {
  state = walk(state, route === 'ferry' ? 'ferry-pad' : 'canopy-pad');
  state = command(state, { type: 'REMEMBER' });
  state = walk(state, route === 'ferry' ? 'basin' : 'workbench');
  state = interact(state, route === 'ferry' ? 'help-lily' : 'help-mono');
  state = interact(state, route === 'ferry' ? 'plant-sailleaf' : 'plant-ribbonvine');
  return finish ? advance(state, 3) : state;
}

function cross(state, route) {
  const bank = getPlayerBank(state);
  const landmark = route === 'ferry' ? `dock-${bank}` : `canopy-${bank}`;
  state = walk(state, landmark);
  state = interact(state, `cross-${route}`);
  state = advance(state, WORLD.routes[route].duration + 0.1);
  assert.equal(state.traversal, null);
  assert.equal(getPlayerBank(state), bank === 'west' ? 'east' : 'west');
  return state;
}

function deliver(state, route) {
  state = cross(state, route);
  state = walk(state, 'nursery');
  return interact(state, 'deliver-star');
}

function home(state, route = 'ferry') {
  if (getPlayerBank(state) === 'east') state = cross(state, route);
  state = walk(state, 'home');
  return interact(state, 'return-home');
}

function fullAdventure(route) {
  let state = buildRoute(begin(), route);
  state = command(state, { type: 'DISMISS' });
  state = deliver(state, route);
  state = home(state, route);
  state = walk(state, 'plot-1');
  return interact(state, `place-${route === 'ferry' ? 'pond' : 'arbor'}-plot-1`);
}

test('construction sockets are physically separated from the light a player must leave behind', () => {
  for (const [route, socketId] of [['ferry', 'basin'], ['canopy', 'workbench']]) {
    const receiver = LIGHT_RECEIVERS[route];
    const socket = WORLD.stream.landmarks[socketId];
    assert.ok(Math.hypot(receiver.x - socket.x, receiver.z - socket.z) > receiver.radius + INTERACTION_RADIUS);
  }
});

test('initial worlds are independent and engine commands do not mutate earlier states', () => {
  const original = createInitialState();
  const snapshot = serialize(original);
  const moving = command(original, { type: 'MOVE_TO', targetId: 'portal' });
  const advanced = advance(moving, 0.1);
  assert.equal(serialize(original), snapshot);
  assert.equal(moving.player.x, original.player.x);
  assert.notEqual(advanced.player.x, moving.player.x);
  assert.deepEqual(createInitialState(), original);
});

test('actual movement activates a pad; leaving it without a Moonprint closes its effect', () => {
  let state = begin();
  state = walk(state, 'ferry-pad');
  assert.equal(getLightState(state).waterGateOpen, true);
  state = walk(state, 'basin');
  assert.equal(getLightState(state).waterGateOpen, false);
  const blocked = dispatch(state, { type: 'INTERACT', actionId: 'help-lily' });
  assert.equal(blocked.accepted, false);
  assert.match(blocked.feedback, /light/i);
  assert.equal(blocked.state, state);
});

test('Moonprints record the actual occupied receiver position and reject remote requests', () => {
  let state = begin();
  const rejected = dispatch(state, { type: 'REMEMBER', receiver: 'ferry', x: -9, z: 3 });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.state.moonprint, null);
  state = walk(state, { x: -8.6, z: 3.2 });
  state = command(state, { type: 'REMEMBER' });
  assert.deepEqual(state.moonprint, { receiver: 'ferry', x: -8.6, z: 3.2 });
  state = walk(state, 'basin');
  assert.equal(getLightState(state).waterGateOpen, true);
  assert.equal(getLightState(state).canopy, false);
});

test('both movement APIs preserve bank boundaries and reject invalid coordinates', () => {
  let state = begin();
  for (const input of [
    { type: 'MOVE_TO', targetId: 'nursery' },
    { type: 'MOVE_TO', x: 0, z: 0 },
    { type: 'MOVE_TO', x: Infinity, z: 3 },
    { type: 'MOVE_TO', x: NaN, z: 3 },
    { type: 'MOVE_TO', targetId: '__proto__' },
    { type: 'MOVE_DIRECTION', dx: 1, dz: 0, seconds: 100 },
  ]) assert.equal(dispatch(state, input).accepted, false);
  for (let i = 0; i < 100; i++) state = command(state, { type: 'MOVE_DIRECTION', dx: 1, dz: 0, seconds: 0.2 });
  assert.equal(state.player.x, WORLD.stream.westBounds.maxX);
  assert.equal(getPlayerBank(state), 'west');
  assert.equal(state.star, 'carried');
});

test('companion and planting actions require proximity and real prerequisites', () => {
  let state = begin();
  assert.equal(dispatch(state, { type: 'INTERACT', actionId: 'deliver-star' }).accepted, false);
  assert.equal(dispatch(state, { type: 'INTERACT', actionId: 'help-lily' }).accepted, false);
  state = walk(state, 'basin');
  assert.equal(dispatch(state, { type: 'INTERACT', actionId: 'plant-sailleaf' }).accepted, false);
  assert.equal(state.ferry.planted, false);
  state = walk(state, 'workbench');
  const options = getAvailableActions(state);
  assert.ok(options.find(option => option.id === 'help-mono' && !option.enabled && option.reason));
  assert.equal(dispatch(state, { type: 'INTERACT', actionId: 'plant-ribbonvine' }).accepted, false);
  assert.equal(state.canopy.vinePlaced, false);
});

for (const route of ['ferry', 'canopy']) {
  test(`${route}: ordinary public inputs complete the quest and persist its distinct garden reward`, () => {
    const state = fullAdventure(route);
    assert.equal(state.scene, 'garden');
    assert.equal(state.star, 'nest');
    assert.equal(state.deliveryRoute, route);
    assert.equal(state[route].complete, true);
    assert.equal(state.moonprint, null);
    assert.equal(state.garden.placements['plot-1'], route === 'ferry' ? 'pond' : 'arbor');
    assert.equal(state.history.filter(event => event.type === 'star-delivered').length, 1);
    assert.ok(state.history.some(event => event.type === 'crossing-completed'));
    assert.match(getObjective(state), /remembers/i);
    const loaded = parseSave(serialize(state));
    assert.equal(loaded.ok, true, loaded.error);
    assert.deepEqual(loaded.state, state);
  });

  test(`${route}: dismissing light pauses unfinished construction and permits a free restart`, () => {
    let state = buildRoute(begin(), route, { finish: false });
    state = advance(state, 0.5);
    const progressKey = route === 'ferry' ? 'growth' : 'progress';
    const partial = state[route][progressKey];
    assert.ok(partial > 0 && partial < 1);
    state = command(state, { type: 'DISMISS' });
    state = advance(state, 20);
    assert.equal(state[route][progressKey], partial);
    assert.equal(state[route].complete, false);
    state = walk(state, route === 'ferry' ? 'ferry-pad' : 'canopy-pad');
    state = command(state, { type: 'REMEMBER' });
    state = walk(state, route === 'ferry' ? 'basin' : 'workbench');
    state = advance(state, 3);
    assert.equal(state[route].complete, true);
    state = command(state, { type: 'DISMISS' });
    assert.equal(getLightState(state)[route], false);
    assert.equal(state[route].complete, true);
  });

  test(`${route}: early and late cancellation recover to a valid endpoint with exactly one carried star`, () => {
    let state = buildRoute(begin(), route);
    state = walk(state, route === 'ferry' ? 'dock-west' : 'canopy-west');
    state = interact(state, `cross-${route}`);
    state = advance(state, 0.5);
    assert.notEqual(state.traversal, null);
    assert.equal(state.player.x > WORLD.routes[route].west.x, true);
    state = command(state, { type: 'CANCEL' });
    assert.equal(getPlayerBank(state), 'west');
    if (route === 'ferry') assert.equal(state.ferry.dock, 'west');
    assert.equal(state.star, 'carried');
    state = interact(state, `cross-${route}`);
    state = advance(state, WORLD.routes[route].duration * 0.75);
    state = interact(state, 'cancel-crossing');
    assert.equal(getPlayerBank(state), 'east');
    if (route === 'ferry') assert.equal(state.ferry.dock, 'east');
    assert.equal(state.star, 'carried');
    assert.equal(state.traversal, null);
    assert.equal(state[route].complete, true);
    assert.equal(parseSave(serialize(state)).ok, true);
    state = walk(state, 'nursery');
    state = interact(state, 'deliver-star');
    assert.equal(state.star, 'nest');
  });

  test(`${route}: reload during traversal resumes safely without requiring a permanent echo`, () => {
    let state = buildRoute(begin(), route);
    state = command(state, { type: 'DISMISS' });
    state = walk(state, route === 'ferry' ? 'dock-west' : 'canopy-west');
    state = interact(state, `cross-${route}`);
    state = advance(state, WORLD.routes[route].duration * 0.65);
    const loaded = parseSave(serialize(state));
    assert.equal(loaded.ok, true, loaded.error);
    state = loaded.state;
    assert.equal(state.traversal, null);
    assert.equal(getPlayerBank(state), 'east');
    if (route === 'ferry') assert.equal(state.ferry.dock, 'east');
    assert.equal(state.moonprint, null);
    assert.equal(state.star, 'carried');
    state = walk(state, 'nursery');
    state = interact(state, 'deliver-star');
    assert.equal(state.star, 'nest');
    assert.equal(parseSave(serialize(state)).ok, true);
  });
}

test('a Moonprint replacement leaves only the newly recorded light active', () => {
  let state = begin();
  state = walk(state, 'ferry-pad');
  state = command(state, { type: 'REMEMBER' });
  state = walk(state, 'canopy-pad');
  state = command(state, { type: 'REMEMBER' });
  state = walk(state, 'workbench');
  assert.equal(state.moonprint.receiver, 'canopy');
  assert.equal(getLightState(state).ferry, false);
  assert.equal(getLightState(state).canopy, true);
});

test('pausing halts walking, growth, and crossings without removing discoveries', () => {
  let state = buildRoute(begin(), 'ferry', { finish: false });
  state = advance(state, 0.5);
  state = command(state, { type: 'MOVE_TO', targetId: 'dock-west' });
  state = command(state, { type: 'PAUSE', paused: true });
  const paused = serialize(state);
  assert.equal(serialize(advance(state, 60)), paused);
  assert.equal(dispatch(state, { type: 'MOVE_TO', targetId: 'home' }).accepted, false);
  state = command(state, { type: 'PAUSE', paused: false });
  state = advance(state, 4);
  assert.equal(state.ferry.complete, true);
  state = interact(state, 'cross-ferry');
  state = advance(state, 0.5);
  state = command(state, { type: 'PAUSE', paused: true });
  const progress = state.traversal.progress;
  state = advance(state, 60);
  assert.equal(state.traversal.progress, progress);
  state = command(state, { type: 'PAUSE', paused: false });
  state = advance(state, 4);
  assert.equal(getPlayerBank(state), 'east');
});

test('leaving an unfinished route clears light, preserves work, and allows completion after returning', () => {
  let state = buildRoute(begin(), 'canopy', { finish: false });
  state = command(state, { type: 'DISMISS' });
  state = home(state);
  assert.equal(state.scene, 'garden');
  assert.equal(state.moonprint, null);
  assert.equal(state.star, 'carried');
  assert.equal(state.canopy.vinePlaced, true);
  const partial = state.canopy.progress;
  state = advance(state, 20);
  assert.equal(state.canopy.progress, partial);
  state = walk(state, 'portal');
  state = interact(state, 'enter-stream');
  state = walk(state, 'canopy-pad');
  state = command(state, { type: 'REMEMBER' });
  state = advance(state, 3);
  assert.equal(state.canopy.complete, true);
  state = deliver(state, 'canopy');
  assert.equal(state.star, 'nest');
});

test('both routes and both rewards coexist; the first choice never locks out the second', () => {
  let state = fullAdventure('ferry');
  state = walk(state, 'portal');
  state = interact(state, 'enter-stream');
  state = buildRoute(state, 'canopy');
  state = cross(state, 'canopy');
  assert.equal(state.star, 'nest');
  state = cross(state, 'canopy');
  state = home(state);
  assert.deepEqual(getUnlockedRewards(state), ['pond', 'arbor']);
  state = walk(state, 'plot-2');
  state = interact(state, 'place-arbor-plot-2');
  assert.deepEqual(state.garden.placements, { 'plot-1': 'pond', 'plot-2': 'arbor', 'plot-3': null });
  assert.equal(state.history.filter(event => event.type === 'star-delivered').length, 1);
  state = walk(state, 'plot-3');
  state = interact(state, 'place-pond-plot-3');
  assert.deepEqual(state.garden.placements, { 'plot-1': null, 'plot-2': 'arbor', 'plot-3': 'pond' });
  assert.equal(state.history.filter(event => event.type === 'garden-feature-moved').length, 1);
  assert.equal(parseSave(serialize(state)).ok, true);
});

test('a crossed route does not fabricate star possession or allow duplicate delivery', () => {
  let state = buildRoute(begin({ pickUp: false }), 'ferry');
  state = cross(state, 'ferry');
  state = walk(state, 'nursery');
  assert.equal(dispatch(state, { type: 'INTERACT', actionId: 'deliver-star' }).accepted, false);
  assert.equal(state.star, 'basket');
  state = cross(state, 'ferry');
  state = walk(state, 'star');
  state = interact(state, 'pick-up-star');
  state = deliver(state, 'ferry');
  assert.equal(dispatch(state, { type: 'INTERACT', actionId: 'deliver-star' }).accepted, false);
  assert.equal(state.history.filter(event => event.type === 'star-delivered').length, 1);
  assert.equal(state.star, 'nest');
});

test('reloading clears unattended motion and pause while retaining valid unfinished work and light', () => {
  let state = buildRoute(begin(), 'ferry', { finish: false });
  state = advance(state, 0.4);
  state = command(state, { type: 'MOVE_TO', targetId: 'home' });
  state = command(state, { type: 'PAUSE', paused: true });
  const loaded = parseSave(serialize(state));
  assert.equal(loaded.ok, true, loaded.error);
  assert.equal(loaded.state.player.target, null);
  assert.equal(loaded.state.paused, false);
  assert.equal(loaded.state.ferry.growth, state.ferry.growth);
  assert.deepEqual(loaded.state.moonprint, state.moonprint);
  assert.equal(advance(loaded.state, 3).ferry.complete, true);
});

test('invalid imports reject contradictory progress, impossible locations, fabricated fields, and duplicate rewards', () => {
  const valid = fullAdventure('ferry');
  const baseline = serialize(valid);
  const corruptions = [
    value => { value.version = 99; },
    value => { value.scene = 'secret'; },
    value => { value.star = ['carried', 'nest']; },
    value => { value.ferry.growth = 0.2; },
    value => { value.ferry.dock = 'middle'; },
    value => { value.ferry.dock = 'east'; },
    value => { value.canopy.complete = true; },
    value => { value.player.x = 99; },
    value => { value.deliveryRoute = null; },
    value => { value.garden.placements['plot-2'] = 'pond'; },
    value => { value.garden.placements['plot-2'] = 'arbor'; },
    value => { value.childEmotion = 'happy'; },
    value => { value.history[0].details.biography = 'Invented personal memory'; },
    value => { value.nextEventId = 1; },
    value => { value.history[0].type = '__proto__'; },
    value => { value.moonprint = { receiver: 'ferry', x: -9, z: 3 }; },
  ];
  for (const corrupt of corruptions) {
    const candidate = JSON.parse(baseline);
    corrupt(candidate);
    const result = parseSave(JSON.stringify(candidate));
    assert.equal(result.ok, false);
    assert.equal(result.state, null);
    assert.ok(result.error);
    assert.equal(serialize(valid), baseline);
  }
  for (const input of ['{', 'null', '{}', '[]', '', 'x'.repeat(200_001), undefined]) {
    assert.equal(parseSave(input).ok, false);
  }
});

test('imports reject river positions and movement targets without a physical crossing', () => {
  const valid = begin();
  const a = JSON.parse(serialize(valid));
  a.player.x = 0;
  assert.equal(parseSave(JSON.stringify(a)).ok, false);
  const b = JSON.parse(serialize(valid));
  b.player.target = { x: 9, z: 0 };
  assert.equal(parseSave(JSON.stringify(b)).ok, false);
  const c = JSON.parse(serialize(valid));
  c.moonprint = { receiver: 'ferry', x: -5, z: 3 };
  assert.equal(parseSave(JSON.stringify(c)).ok, false);
});

test('memory history stays bounded, ordered, and reloadable through many reversible experiments', () => {
  let state = walk(begin(), 'ferry-pad');
  for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
    state = command(state, { type: 'REMEMBER' });
    state = command(state, { type: 'DISMISS' });
  }
  assert.equal(state.history.length, HISTORY_LIMIT);
  assert.ok(state.history[0].id > 1);
  assert.equal(state.nextEventId, state.history.at(-1).id + 1);
  assert.equal(parseSave(serialize(state)).ok, true);
});

test('the ferry bank remains canonical after canopy travel, capped history, and save reload', () => {
  let state = buildRoute(begin(), 'ferry');
  assert.equal(state.ferry.dock, 'west');
  state = buildRoute(state, 'canopy');
  state = cross(state, 'ferry');
  assert.equal(state.ferry.dock, 'east');
  state = cross(state, 'canopy');
  assert.equal(getPlayerBank(state), 'west');
  assert.equal(state.ferry.dock, 'east', 'canopy travel must not move the parked boat');
  state = walk(state, 'ferry-pad');
  for (let i = 0; i < HISTORY_LIMIT; i++) {
    state = command(state, { type: 'REMEMBER' });
    state = command(state, { type: 'DISMISS' });
  }
  assert.equal(state.history.some(event => event.type === 'crossing-completed'), false);
  assert.equal(state.ferry.dock, 'east', 'boat location must not be derived from the capped log');
  const loaded = parseSave(serialize(state));
  assert.equal(loaded.ok, true, loaded.error);
  assert.equal(loaded.state.ferry.dock, 'east');
  assert.equal(getPlayerBank(loaded.state), 'west');
});

test('a ferry at the other dock cannot be boarded remotely and remains reachable by the canopy', () => {
  let state = buildRoute(buildRoute(begin(), 'ferry'), 'canopy');
  state = cross(state, 'ferry');
  assert.equal(state.ferry.dock, 'east');
  state = cross(state, 'canopy');
  state = walk(state, 'dock-west');
  const ferryAction = getAvailableActions(state).find(option => option.id === 'cross-ferry');
  assert.equal(ferryAction.enabled, false);
  assert.equal(ferryAction.reason, 'The ferry is at the other dock. Use the canopy crossing to reach it.');
  const rejected = dispatch(state, { type: 'INTERACT', actionId: 'cross-ferry' });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.state, state);
  assert.equal(state.traversal, null);
  assert.equal(state.ferry.dock, 'east');
  assert.equal(state.star, 'carried');
  state = cross(state, 'canopy');
  state = walk(state, 'dock-east');
  assert.equal(getAvailableActions(state).find(option => option.id === 'cross-ferry').enabled, true);
  state = cross(state, 'ferry');
  assert.equal(getPlayerBank(state), 'west');
  assert.equal(state.ferry.dock, 'west');
  assert.equal(state.star, 'carried');
  assert.equal(parseSave(serialize(state)).ok, true);
});

test('save validation rejects an unbuilt ferry on the far bank or a mismatched departure dock', () => {
  const unfinished = JSON.parse(serialize(begin()));
  unfinished.ferry.dock = 'east';
  assert.equal(parseSave(JSON.stringify(unfinished)).ok, false);
  let state = buildRoute(begin(), 'ferry');
  state = walk(state, 'dock-west');
  state = interact(state, 'cross-ferry');
  state = advance(state, 1);
  const wrongDeparture = JSON.parse(serialize(state));
  wrongDeparture.ferry.dock = 'east';
  assert.equal(parseSave(JSON.stringify(wrongDeparture)).ok, false);
  const correct = parseSave(serialize(state));
  assert.equal(correct.ok, true, correct.error);
  assert.equal(correct.state.ferry.dock, 'west');
  assert.equal(getPlayerBank(correct.state), 'west');
});

test('the same public command sequence has deterministic state and factual event history', () => {
  assert.equal(serialize(fullAdventure('canopy')), serialize(fullAdventure('canopy')));
  assert.equal(advance(createInitialState(), NaN).scene, 'garden');
  assert.deepEqual(advance(createInitialState(), -10), createInitialState());
});
