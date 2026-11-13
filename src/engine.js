/**
 * Little Moon: deterministic, offline first-adventure simulation.
 *
 * All consequential changes enter through dispatch() and advance(). Renderers may
 * inspect state but must never set quest flags. Coordinates use the same x/z
 * ground plane as WORLD. A Moonprint holds an actually occupied light receiver;
 * it is not a duplicate inventory, character, or physical force.
 *
 * Commands:
 *   MOVE_TO {targetId} | {x,z}; MOVE_DIRECTION {dx,dz,seconds};
 *   INTERACT {actionId}; REMEMBER; DISMISS; PAUSE {paused}; CANCEL.
 * parseSave() returns {ok,state,error}. Resuming clears a movement destination and
 * pause, and recovers an interrupted crossing to its nearest valid endpoint.
 */

export const SAVE_VERSION = 1;
export const WALK_SPEED = 3.2;
export const INTERACTION_RADIUS = 1.5;
export const HISTORY_LIMIT = 160;
export const GROWTH_SECONDS = Object.freeze({ ferry: 2.8, canopy: 2.4 });

const point = (id, x, z, label, kind) => Object.freeze({ id, x, z, label, kind });
const bounds = (minX, maxX, minZ = -7, maxZ = 7) => Object.freeze({ minX, maxX, minZ, maxZ });

export const WORLD = Object.freeze({
  garden: Object.freeze({
    bounds: bounds(-11, 11),
    spawn: Object.freeze({ x: -2, z: 3 }),
    landmarks: Object.freeze({
      portal: point('portal', 8, 2, 'The stream path', 'portal'),
      'plot-1': point('plot-1', -4, 0, 'West garden plot', 'plot'),
      'plot-2': point('plot-2', 0, 0, 'Middle garden plot', 'plot'),
      'plot-3': point('plot-3', 4, 0, 'East garden plot', 'plot'),
    }),
  }),
  stream: Object.freeze({
    bounds: bounds(-11, 11),
    westBounds: bounds(-11, -2.4),
    eastBounds: bounds(2.4, 11),
    spawn: Object.freeze({ x: -9, z: 0 }),
    landmarks: Object.freeze({
      star: point('star', -9, 0, 'The sleeping star', 'star'),
      home: point('home', -9, 5.5, 'The way home', 'portal'),
      'ferry-pad': point('ferry-pad', -9, 3, 'The water petal', 'receiver'),
      basin: point('basin', -5, 3, 'Lily’s leaf basin', 'construction'),
      'dock-west': point('dock-west', -2.8, 4, 'West ferry landing', 'crossing'),
      'dock-east': point('dock-east', 2.8, 4, 'East ferry landing', 'crossing'),
      'canopy-pad': point('canopy-pad', -9, -3, 'The moonflower petal', 'receiver'),
      workbench: point('workbench', -5, -3, 'Mono’s vine supports', 'construction'),
      'canopy-west': point('canopy-west', -2.8, -4, 'West canopy landing', 'crossing'),
      'canopy-east': point('canopy-east', 2.8, -4, 'East canopy landing', 'crossing'),
      nursery: point('nursery', 8, 0, 'The lanternflower nursery', 'nursery'),
    }),
  }),
  routes: Object.freeze({
    ferry: Object.freeze({ west: Object.freeze({ x: -2.8, z: 4 }), east: Object.freeze({ x: 2.8, z: 4 }), duration: 4 }),
    canopy: Object.freeze({ west: Object.freeze({ x: -2.8, z: -4 }), east: Object.freeze({ x: 2.8, z: -4 }), duration: 3.4 }),
  }),
});

export const LIGHT_RECEIVERS = Object.freeze({
  ferry: Object.freeze({ id: 'ferry', landmarkId: 'ferry-pad', x: -9, z: 3, radius: 0.8 }),
  canopy: Object.freeze({ id: 'canopy', landmarkId: 'canopy-pad', x: -9, z: -3, radius: 0.8 }),
});

const PLOTS = ['plot-1', 'plot-2', 'plot-3'];
const ROUTES = ['ferry', 'canopy'];
const REWARDS = ['pond', 'arbor'];
const EPSILON = 1e-8;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const within = (p, b) => finite(p?.x) && finite(p?.z) && p.x >= b.minX - EPSILON && p.x <= b.maxX + EPSILON && p.z >= b.minZ - EPSILON && p.z <= b.maxZ + EPSILON;
const routeComplete = (state, route) => route === 'ferry' ? state.ferry.complete : state.canopy.complete;

export function createInitialState() {
  return {
    version: SAVE_VERSION,
    scene: 'garden',
    player: { ...WORLD.garden.spawn, target: null },
    paused: false,
    star: 'basket',
    moonprint: null,
    ferry: { prepared: false, planted: false, growth: 0, complete: false, dock: 'west' },
    canopy: { monoHelp: false, vinePlaced: false, progress: 0, complete: false },
    traversal: null,
    lastCrossing: null,
    deliveryRoute: null,
    garden: { placements: { 'plot-1': null, 'plot-2': null, 'plot-3': null } },
    history: [],
    nextEventId: 1,
  };
}

function copyState(state) {
  return {
    ...state,
    player: { ...state.player, target: state.player.target ? { ...state.player.target } : null },
    moonprint: state.moonprint ? { ...state.moonprint } : null,
    ferry: { ...state.ferry },
    canopy: { ...state.canopy },
    traversal: state.traversal ? { ...state.traversal } : null,
    garden: { placements: { ...state.garden.placements } },
    history: [...state.history],
  };
}

function record(state, type, details = {}) {
  const event = { id: state.nextEventId++, type, details };
  state.history.push(event);
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
  return event;
}

function success(state, previousId, feedback = '') {
  return { state, accepted: true, feedback, events: state.history.filter(event => event.id >= previousId) };
}

function reject(state, feedback) {
  return { state, accepted: false, feedback, events: [] };
}

export function getPlayerBank(state) {
  if (state.scene !== 'stream') return null;
  if (state.traversal) return null;
  return state.player.x < 0 ? 'west' : 'east';
}

function playerBounds(state) {
  if (state.scene === 'garden') return WORLD.garden.bounds;
  return getPlayerBank(state) === 'west' ? WORLD.stream.westBounds : WORLD.stream.eastBounds;
}

function isNear(state, targetId, radius = INTERACTION_RADIUS) {
  const target = WORLD[state.scene]?.landmarks[targetId];
  return !state.traversal && !!target && distance(state.player, target) <= radius + EPSILON;
}

export function getLightState(state) {
  const result = { ferry: false, canopy: false, waterGateOpen: false, anchorRevealed: false };
  if (state.scene !== 'stream') return result;
  for (const [id, receiver] of Object.entries(LIGHT_RECEIVERS)) {
    const playerLight = !state.traversal && distance(state.player, receiver) <= receiver.radius + EPSILON;
    const printLight = state.moonprint?.receiver === id && distance(state.moonprint, receiver) <= receiver.radius + EPSILON;
    result[id] = playerLight || printLight;
  }
  result.waterGateOpen = result.ferry;
  result.anchorRevealed = result.canopy || state.canopy.complete;
  return result;
}

export function getUnlockedRewards(state) {
  if (state.star !== 'nest') return [];
  return [state.ferry.complete ? 'pond' : null, state.canopy.complete ? 'arbor' : null].filter(Boolean);
}

export function getObjective(state) {
  if (state.traversal) return 'Travel with the star. You can return to a safe bank at any time.';
  if (state.scene === 'garden') {
    if (state.star !== 'nest') return 'Find the stream path. A small star needs a way home.';
    if (!Object.values(state.garden.placements).some(Boolean)) return 'Choose a garden plot and plant the gift from your adventure.';
    return 'Your garden remembers. Enjoy your new place, or visit the stream to discover another route.';
  }
  if (state.star === 'basket') return 'Meet the sleeping star and invite it to come with you.';
  if (state.star === 'nest') return getPlayerBank(state) === 'east'
    ? 'The star is home. Cross back and follow the path to your garden.'
    : 'Follow the way home. Your garden has room for a new memory.';
  if (getPlayerBank(state) === 'east') return 'Bring the star to the lanternflower nursery.';
  if (state.ferry.complete || state.canopy.complete) return 'Your crossing is ready. Bring the star to its landing.';
  if (state.moonprint?.receiver === 'ferry') {
    if (!state.ferry.prepared) return 'The water is flowing. Ask Lily to prepare the leaf basin.';
    if (!state.ferry.planted) return 'Plant a Sailleaf in Lily’s prepared basin.';
    return getLightState(state).ferry ? 'The leaf is unfolding. Watch it become a ferry.' : 'Light the water petal again to help the leaf finish growing.';
  }
  if (state.moonprint?.receiver === 'canopy') {
    if (!state.canopy.monoHelp) return 'The far anchor is visible. Ask Mono to secure it.';
    if (!state.canopy.vinePlaced) return 'Place a Ribbonvine between the prepared supports.';
    return getLightState(state).canopy ? 'The vine is connecting the supports.' : 'Light the moonflower petal again to finish the crossing.';
  }
  return 'Explore a moon petal. Remember its light, then ask Lily or Mono for help.';
}

function action(id, label, targetId, enabled = true, reason = '') {
  return { id, label, targetId, enabled, reason };
}

/** Local, contextual UI actions; use enabled/reason to explain a missing condition. */
export function getAvailableActions(state) {
  if (state.paused) return [];
  if (state.traversal) return [action('cancel-crossing', 'Return to a safe bank', null)];
  const actions = [];
  if (state.scene === 'garden') {
    if (isNear(state, 'portal')) actions.push(action('enter-stream', 'Visit the stream', 'portal'));
    const rewards = getUnlockedRewards(state);
    for (const plotId of PLOTS) {
      if (!isNear(state, plotId)) continue;
      for (const kind of rewards) {
        if (state.garden.placements[plotId] === kind) continue;
        const label = kind === 'pond' ? 'Plant a lantern pond' : 'Plant a vine nook';
        const occupied = state.garden.placements[plotId] !== null;
        actions.push(action(`place-${kind}-${plotId}`, label, plotId, !occupied, occupied ? 'Choose an empty garden plot.' : ''));
      }
    }
    return actions;
  }
  const light = getLightState(state);
  if (state.star === 'basket' && isNear(state, 'star')) actions.push(action('pick-up-star', 'Invite the star along', 'star'));
  if (isNear(state, 'home')) actions.push(action('return-home', 'Return to the garden', 'home'));
  for (const receiver of Object.values(LIGHT_RECEIVERS)) {
    if (isNear(state, receiver.landmarkId, receiver.radius)) actions.push(action('remember-light', 'Remember this light', receiver.landmarkId));
  }
  if (isNear(state, 'basin') && !state.ferry.complete) {
    if (!state.ferry.prepared) actions.push(action('help-lily', 'Ask Lily to prepare the basin', 'basin', light.ferry, light.ferry ? '' : 'The water petal needs light. Leave a Moonprint there.'));
    if (!state.ferry.planted) actions.push(action('plant-sailleaf', 'Plant the Sailleaf', 'basin', state.ferry.prepared && light.ferry, !state.ferry.prepared ? 'Ask Lily to prepare the basin first.' : light.ferry ? '' : 'The water petal needs light.'));
  }
  if (isNear(state, 'workbench') && !state.canopy.complete) {
    if (!state.canopy.monoHelp) actions.push(action('help-mono', 'Ask Mono to secure the anchor', 'workbench', light.canopy, light.canopy ? '' : 'The moonflower petal needs light. Leave a Moonprint there.'));
    if (!state.canopy.vinePlaced) actions.push(action('plant-ribbonvine', 'Connect the Ribbonvine', 'workbench', state.canopy.monoHelp && light.canopy, !state.canopy.monoHelp ? 'Ask Mono to secure the far anchor first.' : light.canopy ? '' : 'The moonflower petal needs light.'));
  }
  const bank = getPlayerBank(state);
  const ferryDock = bank === 'west' ? 'dock-west' : 'dock-east';
  const canopyDock = bank === 'west' ? 'canopy-west' : 'canopy-east';
  if (isNear(state, ferryDock)) {
    const ferryHere = state.ferry.complete && state.ferry.dock === bank;
    const reason = !state.ferry.complete
      ? 'The Sailleaf ferry is still waiting to grow.'
      : ferryHere ? '' : 'The ferry is at the other dock. Use the canopy crossing to reach it.';
    actions.push(action('cross-ferry', bank === 'west' ? 'Sail to the nursery bank' : 'Sail back to the garden bank', ferryDock, ferryHere, reason));
  }
  if (isNear(state, canopyDock)) actions.push(action('cross-canopy', bank === 'west' ? 'Cross to the nursery bank' : 'Cross back to the garden bank', canopyDock, state.canopy.complete, state.canopy.complete ? '' : 'The Ribbonvine crossing is not connected yet.'));
  if (isNear(state, 'nursery') && state.star !== 'nest') actions.push(action('deliver-star', 'Bring the star home', 'nursery', state.star === 'carried', state.star === 'carried' ? '' : 'The sleeping star is waiting on the other bank.'));
  return actions;
}

function recoverCrossing(state) {
  const { route, from, progress } = state.traversal;
  const to = progress < 0.5 ? from : from === 'west' ? 'east' : 'west';
  state.player = { ...WORLD.routes[route][to], target: null };
  if (route === 'ferry') state.ferry.dock = to;
  if (to !== from) state.lastCrossing = route;
  state.traversal = null;
  record(state, 'crossing-cancelled', { route, to });
}

export function dispatch(state, command) {
  if (!command || typeof command !== 'object' || typeof command.type !== 'string') return reject(state, 'Choose an action to try.');
  const { type } = command;
  const previousId = state.nextEventId;
  if (type === 'PAUSE') {
    if (command.paused !== undefined && typeof command.paused !== 'boolean') return reject(state, 'Pause needs an on or off choice.');
    const next = copyState(state);
    next.paused = command.paused ?? !state.paused;
    return success(next, previousId, next.paused ? 'The adventure is resting.' : 'Ready when you are.');
  }
  const cancelling = type === 'CANCEL' || type === 'INTERACT' && command.actionId === 'cancel-crossing';
  if (cancelling) {
    if (!state.traversal) return reject(state, 'You are already on safe ground.');
    const next = copyState(state);
    recoverCrossing(next);
    return success(next, previousId, 'Back on a safe bank. The star is still with you.');
  }
  if (state.paused) return reject(state, 'Resume the adventure when you are ready.');
  if (state.traversal) return reject(state, 'Enjoy the crossing, or return to a safe bank.');

  if (type === 'MOVE_TO') {
    const target = typeof command.targetId === 'string'
      ? WORLD[state.scene].landmarks[command.targetId]
      : { x: command.x, z: command.z };
    if (!target || !finite(target.x) || !finite(target.z)) return reject(state, 'Choose a place in this scene.');
    if (!within(target, playerBounds(state))) return reject(state, state.scene === 'stream' ? 'The river needs a crossing. Find a ferry or canopy landing.' : 'That place is beyond the garden path.');
    const next = copyState(state);
    next.player.target = { x: target.x, z: target.z };
    return success(next, previousId);
  }
  if (type === 'MOVE_DIRECTION') {
    if (!finite(command.dx) || !finite(command.dz) || !finite(command.seconds) || command.seconds < 0 || command.seconds > 0.25) return reject(state, 'That movement step is unavailable.');
    const length = Math.hypot(command.dx, command.dz);
    if (length === 0 || command.seconds === 0) return success(state, previousId);
    const next = copyState(state);
    const allowed = playerBounds(state);
    const scale = WALK_SPEED * command.seconds / Math.max(1, length);
    next.player.x = clamp(state.player.x + command.dx * scale, allowed.minX, allowed.maxX);
    next.player.z = clamp(state.player.z + command.dz * scale, allowed.minZ, allowed.maxZ);
    next.player.target = null;
    return success(next, previousId);
  }
  if (type === 'REMEMBER' || type === 'INTERACT' && command.actionId === 'remember-light') {
    if (state.scene !== 'stream') return reject(state, 'A Moonprint needs a moon-sensitive petal to hold its light.');
    const receiver = Object.values(LIGHT_RECEIVERS).find(candidate => distance(state.player, candidate) <= candidate.radius + EPSILON);
    if (!receiver) return reject(state, 'Stand on a moon petal first. Little Moon remembers the light you actually placed.');
    const next = copyState(state);
    next.player.target = null;
    next.moonprint = { receiver: receiver.id, x: state.player.x, z: state.player.z };
    record(next, 'moonprint-recorded', { receiver: receiver.id });
    return success(next, previousId, 'Your Moonprint will hold this light while you explore.');
  }
  if (type === 'DISMISS' || type === 'INTERACT' && command.actionId === 'dismiss-light') {
    if (!state.moonprint) return reject(state, 'There is no Moonprint to put away.');
    const next = copyState(state);
    record(next, 'moonprint-dismissed', { receiver: next.moonprint.receiver });
    next.moonprint = null;
    return success(next, previousId, 'The Moonprint is resting. Finished crossings will stay.');
  }
  if (type !== 'INTERACT' || typeof command.actionId !== 'string') return reject(state, 'Choose a nearby friend or object.');
  const available = getAvailableActions(state).find(candidate => candidate.id === command.actionId);
  if (!available) return reject(state, 'Move closer to the right place for that action.');
  if (!available.enabled) return reject(state, available.reason);
  const next = copyState(state);
  next.player.target = null;
  const id = command.actionId;
  if (id === 'enter-stream') {
    next.scene = 'stream';
    next.player = { ...WORLD.stream.spawn, target: null };
    next.moonprint = null;
    record(next, 'entered-stream');
    return success(next, previousId, 'A stream, two friends, and one star in the wrong place.');
  }
  if (id === 'return-home') {
    next.scene = 'garden';
    next.player = { ...WORLD.garden.spawn, target: null };
    next.moonprint = null;
    record(next, 'returned-home');
    return success(next, previousId, next.star === 'nest' ? 'Your garden has room for what you made together.' : 'The stream will be waiting when you return.');
  }
  if (id === 'pick-up-star') {
    next.star = 'carried';
    record(next, 'star-picked-up');
    return success(next, previousId, 'The star is coming with you. Its lanternflower is across the stream.');
  }
  if (id === 'help-lily') {
    next.ferry.prepared = true;
    record(next, 'lily-prepared-basin');
    return success(next, previousId, 'Lily prepared the basin. Now it needs a Sailleaf.');
  }
  if (id === 'plant-sailleaf') {
    next.ferry.planted = true;
    record(next, 'sailleaf-planted');
    return success(next, previousId, 'The Sailleaf is growing in the flowing water.');
  }
  if (id === 'help-mono') {
    next.canopy.monoHelp = true;
    record(next, 'mono-attached-anchor');
    return success(next, previousId, 'Mono secured the far anchor. The supports are ready for a Ribbonvine.');
  }
  if (id === 'plant-ribbonvine') {
    next.canopy.vinePlaced = true;
    record(next, 'ribbonvine-planted');
    return success(next, previousId, 'The Ribbonvine is reaching between the supports.');
  }
  if (id === 'cross-ferry' || id === 'cross-canopy') {
    const route = id === 'cross-ferry' ? 'ferry' : 'canopy';
    const from = getPlayerBank(state);
    if (route === 'ferry') next.ferry.dock = from;
    next.player = { ...WORLD.routes[route][from], target: null };
    next.traversal = { route, from, progress: 0 };
    record(next, 'crossing-started', { route, from });
    return success(next, previousId, route === 'ferry' ? 'A boat made of a leaf. I shall be reviewing the rest of my assumptions.' : 'A path above the river. That was not on my map.');
  }
  if (id === 'deliver-star') {
    if (!next.lastCrossing || !routeComplete(next, next.lastCrossing)) return reject(state, 'Bring the star along a completed crossing first.');
    next.star = 'nest';
    next.deliveryRoute = next.lastCrossing;
    record(next, 'star-delivered', { route: next.deliveryRoute });
    return success(next, previousId, 'The star is home. The crossing you made will remain for your friends.');
  }
  const placement = /^place-(pond|arbor)-(plot-[123])$/.exec(id);
  if (placement) {
    const [, kind, plotId] = placement;
    const fromPlotId = PLOTS.find(plot => next.garden.placements[plot] === kind);
    if (fromPlotId) next.garden.placements[fromPlotId] = null;
    next.garden.placements[plotId] = kind;
    if (fromPlotId) record(next, 'garden-feature-moved', { kind, fromPlotId, toPlotId: plotId });
    else record(next, 'garden-feature-planted', { kind, plotId });
    return success(next, previousId, fromPlotId ? 'A new place for the same lovely memory.' : 'A little adventure. A world that remembers.');
  }
  return reject(state, 'That action is not available here.');
}

/** Advance game time; wall-clock time, network services, and random values are unused. */
export function advance(state, seconds) {
  if (!finite(seconds) || seconds <= 0 || state.paused) return state;
  const duration = Math.min(seconds, 60);
  const next = copyState(state);
  let remaining = duration;
  while (remaining > EPSILON) {
    const step = Math.min(remaining, 1 / 30);
    remaining -= step;
    if (next.traversal) {
      const traversal = next.traversal;
      const route = WORLD.routes[traversal.route];
      const to = traversal.from === 'west' ? 'east' : 'west';
      traversal.progress = Math.min(1, traversal.progress + step / route.duration);
      const a = route[traversal.from];
      const b = route[to];
      next.player.x = a.x + (b.x - a.x) * traversal.progress;
      next.player.z = a.z + (b.z - a.z) * traversal.progress;
      if (traversal.progress >= 1 - EPSILON) {
        next.player = { ...b, target: null };
        if (traversal.route === 'ferry') next.ferry.dock = to;
        next.lastCrossing = traversal.route;
        record(next, 'crossing-completed', { route: traversal.route, to });
        next.traversal = null;
      }
    } else if (next.player.target) {
      const target = next.player.target;
      const length = distance(next.player, target);
      const travel = WALK_SPEED * step;
      if (length <= travel + EPSILON) {
        next.player.x = target.x;
        next.player.z = target.z;
        next.player.target = null;
      } else {
        next.player.x += (target.x - next.player.x) / length * travel;
        next.player.z += (target.z - next.player.z) / length * travel;
      }
    }
    const light = getLightState(next);
    if (next.ferry.planted && !next.ferry.complete && light.ferry) {
      next.ferry.growth = Math.min(1, next.ferry.growth + step / GROWTH_SECONDS.ferry);
      if (next.ferry.growth >= 1 - EPSILON) {
        next.ferry.growth = 1;
        next.ferry.complete = true;
        record(next, 'ferry-grown');
      }
    }
    if (next.canopy.vinePlaced && !next.canopy.complete && light.canopy) {
      next.canopy.progress = Math.min(1, next.canopy.progress + step / GROWTH_SECONDS.canopy);
      if (next.canopy.progress >= 1 - EPSILON) {
        next.canopy.progress = 1;
        next.canopy.complete = true;
        record(next, 'canopy-grown');
      }
    }
  }
  return next;
}

const EVENT_DETAILS = Object.freeze({
  'entered-stream': {}, 'returned-home': {}, 'star-picked-up': {},
  'moonprint-recorded': { receiver: ROUTES }, 'moonprint-dismissed': { receiver: ROUTES },
  'lily-prepared-basin': {}, 'sailleaf-planted': {}, 'ferry-grown': {},
  'mono-attached-anchor': {}, 'ribbonvine-planted': {}, 'canopy-grown': {},
  'crossing-started': { route: ROUTES, from: ['west', 'east'] },
  'crossing-completed': { route: ROUTES, to: ['west', 'east'] },
  'crossing-cancelled': { route: ROUTES, to: ['west', 'east'] },
  'star-delivered': { route: ROUTES },
  'garden-feature-planted': { kind: REWARDS, plotId: PLOTS },
  'garden-feature-moved': { kind: REWARDS, fromPlotId: PLOTS, toPlotId: PLOTS },
});

function ensure(condition, message) { if (!condition) throw new Error(message); }
function exactObject(value, keys, name) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), `${name} is missing or invalid.`);
  ensure(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), `${name} has an unsupported shape.`);
}
function bool(value, name) { ensure(typeof value === 'boolean', `${name} must be true or false.`); }
function unit(value, name) { ensure(finite(value) && value >= 0 && value <= 1, `${name} is outside its valid range.`); }
function pointValue(value, name) {
  exactObject(value, ['x', 'z'], name);
  ensure(finite(value.x) && finite(value.z), `${name} is not a valid position.`);
}

function validateState(state) {
  exactObject(state, ['version', 'scene', 'player', 'paused', 'star', 'moonprint', 'ferry', 'canopy', 'traversal', 'lastCrossing', 'deliveryRoute', 'garden', 'history', 'nextEventId'], 'Save');
  ensure(state.version === SAVE_VERSION, 'This save uses a different adventure version.');
  ensure(['garden', 'stream'].includes(state.scene), 'The saved scene is unknown.');
  bool(state.paused, 'Pause');
  ensure(['basket', 'carried', 'nest'].includes(state.star), 'The star location is invalid.');
  exactObject(state.player, ['x', 'z', 'target'], 'Player');
  ensure(within(state.player, WORLD[state.scene].bounds), 'The saved player is outside the world.');
  if (state.player.target !== null) {
    pointValue(state.player.target, 'Movement target');
    ensure(within(state.player.target, WORLD[state.scene].bounds), 'The movement target is outside the world.');
  }
  exactObject(state.ferry, ['prepared', 'planted', 'growth', 'complete', 'dock'], 'Ferry');
  for (const key of ['prepared', 'planted', 'complete']) bool(state.ferry[key], `Ferry ${key}`);
  ensure(['west', 'east'].includes(state.ferry.dock), 'The ferry dock is invalid.');
  ensure(state.ferry.complete || state.ferry.dock === 'west', 'An unfinished ferry must remain at its growing bank.');
  unit(state.ferry.growth, 'Ferry growth');
  ensure(!state.ferry.planted || state.ferry.prepared, 'The leaf basin was not prepared.');
  ensure(state.ferry.growth === 0 || state.ferry.planted, 'Ferry growth has no planted seed.');
  ensure(state.ferry.complete === (state.ferry.growth === 1), 'The ferry completion state is inconsistent.');
  exactObject(state.canopy, ['monoHelp', 'vinePlaced', 'progress', 'complete'], 'Canopy');
  for (const key of ['monoHelp', 'vinePlaced', 'complete']) bool(state.canopy[key], `Canopy ${key}`);
  unit(state.canopy.progress, 'Canopy progress');
  ensure(!state.canopy.vinePlaced || state.canopy.monoHelp, 'The vine anchors were not prepared.');
  ensure(state.canopy.progress === 0 || state.canopy.vinePlaced, 'Canopy growth has no placed vine.');
  ensure(state.canopy.complete === (state.canopy.progress === 1), 'The canopy completion state is inconsistent.');
  for (const key of ['lastCrossing', 'deliveryRoute']) {
    ensure(state[key] === null || ROUTES.includes(state[key]), `The ${key} route is invalid.`);
    ensure(state[key] === null || routeComplete(state, state[key]), `The ${key} route is unfinished.`);
  }
  ensure((state.star === 'nest') === (state.deliveryRoute !== null), 'The star delivery record is inconsistent.');
  if (state.moonprint !== null) {
    exactObject(state.moonprint, ['receiver', 'x', 'z'], 'Moonprint');
    ensure(state.scene === 'stream' && ROUTES.includes(state.moonprint.receiver), 'The Moonprint has no valid light receiver.');
    const receiver = LIGHT_RECEIVERS[state.moonprint.receiver];
    ensure(finite(state.moonprint.x) && finite(state.moonprint.z) && distance(state.moonprint, receiver) <= receiver.radius + EPSILON, 'The Moonprint is outside its recorded light receiver.');
  }
  if (state.traversal !== null) {
    exactObject(state.traversal, ['route', 'from', 'progress'], 'Crossing');
    const { route, from, progress } = state.traversal;
    ensure(state.scene === 'stream' && ROUTES.includes(route) && ['west', 'east'].includes(from), 'The crossing is invalid.');
    unit(progress, 'Crossing progress');
    ensure(progress < 1 && routeComplete(state, route) && state.player.target === null, 'The saved crossing cannot be resumed.');
    ensure(route !== 'ferry' || state.ferry.dock === from, 'The ferry departure bank does not match its crossing.');
    const a = WORLD.routes[route][from];
    const b = WORLD.routes[route][from === 'west' ? 'east' : 'west'];
    const expected = { x: a.x + (b.x - a.x) * progress, z: a.z + (b.z - a.z) * progress };
    ensure(distance(state.player, expected) < 0.001, 'The player is not on the saved crossing.');
  } else if (state.scene === 'stream') {
    const bankBounds = state.player.x < 0 ? WORLD.stream.westBounds : WORLD.stream.eastBounds;
    ensure(within(state.player, bankBounds), 'The saved player needs a valid river bank.');
    ensure(state.player.target === null || within(state.player.target, bankBounds), 'A saved movement would cross the river without a route.');
  }
  if (state.ferry.complete && !state.canopy.complete && state.traversal === null) {
    const accessibleBank = state.scene === 'garden' ? 'west' : getPlayerBank(state);
    ensure(state.ferry.dock === accessibleBank, 'The saved ferry would leave the explorer without a crossing.');
  }
  exactObject(state.garden, ['placements'], 'Garden');
  exactObject(state.garden.placements, PLOTS, 'Garden plots');
  const usedRewards = new Set();
  for (const kind of Object.values(state.garden.placements)) {
    ensure(kind === null || REWARDS.includes(kind), 'A garden feature is unknown.');
    if (kind === null) continue;
    ensure(getUnlockedRewards(state).includes(kind) && !usedRewards.has(kind), 'A garden feature is unavailable or duplicated.');
    usedRewards.add(kind);
  }
  ensure(Array.isArray(state.history) && state.history.length <= HISTORY_LIMIT, 'The memory record is too large.');
  ensure(Number.isSafeInteger(state.nextEventId) && state.nextEventId >= 1, 'The memory sequence is invalid.');
  let previousId = null;
  for (const event of state.history) {
    exactObject(event, ['id', 'type', 'details'], 'Memory');
    ensure(Number.isSafeInteger(event.id) && event.id >= 1 && (previousId === null || event.id === previousId + 1), 'The memory sequence is out of order.');
    ensure(typeof event.type === 'string' && Object.hasOwn(EVENT_DETAILS, event.type), 'A memory type is unknown.');
    const schema = EVENT_DETAILS[event.type];
    exactObject(event.details, Object.keys(schema), 'Memory details');
    for (const [key, values] of Object.entries(schema)) ensure(values.includes(event.details[key]), 'A memory detail is invalid.');
    previousId = event.id;
  }
  ensure(previousId === null ? state.nextEventId === 1 : state.nextEventId === previousId + 1, 'The next memory number is inconsistent.');
  return state;
}

export function serialize(state) {
  validateState(state);
  return JSON.stringify(state);
}

export function parseSave(input) {
  try {
    ensure(typeof input === 'string' && input.length <= 200_000, 'Choose a supported adventure save file.');
    const parsed = JSON.parse(input);
    validateState(parsed);
    const state = copyState(parsed);
    state.paused = false;
    state.player.target = null;
    if (state.traversal) recoverCrossing(state);
    return { ok: true, state, error: null };
  } catch (error) {
    return { ok: false, state: null, error: error instanceof Error ? error.message : 'This adventure save could not be read.' };
  }
}
