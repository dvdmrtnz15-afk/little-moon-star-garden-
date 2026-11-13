import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// All progression uses the public controls at the normal simulation speed.
// The debug API below is read-only observation; tests never dispatch game actions,
// teleport the player, or write quest flags. Only the corruption test deliberately
// supplies malformed save bytes before the application starts.
const SAVE_KEY = 'littlemoon.adventure.v1';
const LANDMARKS = {
  portal: [8, 2],
  'plot-1': [-4, 0],
  'plot-2': [0, 0],
  'plot-3': [4, 0],
  star: [-9, 0],
  home: [-9, 5.5],
  'ferry-pad': [-9, 3],
  basin: [-5, 3],
  'dock-west': [-2.8, 4],
  'dock-east': [2.8, 4],
  'canopy-pad': [-9, -3],
  workbench: [-5, -3],
  'canopy-west': [-2.8, -4],
  'canopy-east': [2.8, -4],
  nursery: [8, 0],
};

const snapshot = (page) => page.evaluate(() => window.__littleMoon.snapshot());

async function attachJson(testInfo, name, value) {
  const path = testInfo.outputPath(`${name}.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
  await testInfo.attach(name, { path, contentType: 'application/json' });
}

async function attachScreenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function stateMatches(page, predicate, message, timeout = 30_000) {
  await expect.poll(async () => predicate(await snapshot(page)), {
    message,
    timeout,
    intervals: [100, 250, 500],
  }).toBe(true);
}

async function activate(page, selector, touch = false) {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  if (touch) await control.tap();
  else await control.click();
}

async function command(page, id, touch = false) {
  await activate(page, `[data-command="${id}"]`, touch);
}

async function action(page, id, touch = false) {
  await activate(page, `[data-action="${id}"]`, touch);
}

async function selectPlace(page, id, touch = false) {
  await command(page, 'places', touch);
  await activate(page, `[data-landmark="${id}"]`, touch);
}

async function arrive(page, id) {
  const [x, z] = LANDMARKS[id];
  await stateMatches(page, (s) =>
    Math.hypot(s.player.x - x, s.player.z - z) < 0.55 && !s.player.target,
  `The explorer should walk normally to ${id}`);
}

async function go(page, id, touch = false) {
  await selectPlace(page, id, touch);
  await arrive(page, id);
}

async function begin(page, testInfo, touch = false) {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await command(page, 'begin', touch);
  await stateMatches(page, (s) => !s.paused, 'Beginning should resume the simulation');
  await expect.poll(async () => page.evaluate(() => window.__littleMoon.rendererInfo().triangles))
    .toBeGreaterThan(0);
  const rendering = await page.evaluate(() => window.__littleMoon.rendererInfo());
  expect(rendering.renderer).toBe('WebGL');
  expect(rendering.contextLost).toBe(false);
  expect(rendering.drawCalls).toBeGreaterThan(0);
  await attachJson(testInfo, 'renderer-evidence', {
    environment: 'Headless Chromium with ANGLE/SwiftShader software WebGL; not hardware GPU validation',
    ...rendering,
  });
}

async function enterStream(page, touch = false) {
  if ((await snapshot(page)).scene !== 'stream') {
    await go(page, 'portal', touch);
    await action(page, 'enter-stream', touch);
    await stateMatches(page, (s) => s.scene === 'stream', 'The portal should enter the stream');
  }
}

async function completeAdventure(page, route, testInfo, { touch = false, plot = 'plot-1' } = {}) {
  await enterStream(page, touch);
  await go(page, 'star', touch);
  await action(page, 'pick-up-star', touch);
  await stateMatches(page, (s) => s.star === 'carried', 'The explorer should carry the rescued star');

  await go(page, `${route}-pad`, touch);
  await command(page, 'remember', touch);
  await stateMatches(page, (s) => s.moonprint?.receiver === route,
    'The Moonprint should remember the actual light receiver');

  if (route === 'ferry') {
    await go(page, 'basin', touch);
    await action(page, 'help-lily', touch);
    await action(page, 'plant-sailleaf', touch);
    await stateMatches(page, (s) => s.ferry.complete, 'The lit, tended Sailleaf should become a ferry');
  } else {
    await go(page, 'workbench', touch);
    await action(page, 'help-mono', touch);
    await action(page, 'plant-ribbonvine', touch);
    await stateMatches(page, (s) => s.canopy.complete, 'Mono and the Ribbonvine should complete the canopy crossing');
  }

  // Completion must survive releasing the magic that enabled construction.
  await command(page, 'dismiss', touch);
  await stateMatches(page, (s) => !s.moonprint && s[route].complete,
    'A completed physical route should remain usable after releasing the Moonprint');
  await attachScreenshot(page, testInfo, `${route}-constructed`);

  const west = route === 'ferry' ? 'dock-west' : 'canopy-west';
  const east = route === 'ferry' ? 'dock-east' : 'canopy-east';
  await go(page, west, touch);
  await action(page, `cross-${route}`, touch);
  await stateMatches(page, (s) => !s.traversal && s.player.x > 2,
    'The explorer should complete the crossing through ordinary controls');
  await go(page, 'nursery', touch);
  await action(page, 'deliver-star', touch);
  await stateMatches(page, (s) => s.star === 'nest' && s.deliveryRoute === route,
    'The star should reach its lanternflower by the selected route');

  await go(page, east, touch);
  await action(page, `cross-${route}`, touch);
  await stateMatches(page, (s) => !s.traversal && s.player.x < -2,
    'The persistent crossing should allow the explorer to return');
  await go(page, 'home', touch);
  await action(page, 'return-home', touch);
  await stateMatches(page, (s) => s.scene === 'garden', 'The adventure should return to the garden');

  const feature = route === 'ferry' ? 'pond' : 'arbor';
  await go(page, plot, touch);
  await action(page, `place-${feature}-${plot}`, touch);
  await stateMatches(page, (s) => s.garden.placements[plot] === feature,
    'The adventure should create a lasting, player-placed garden feature');
  await command(page, 'keep-exploring', touch);
  await attachScreenshot(page, testInfo, `${route}-garden`);
  return { plot, feature };
}

function runtimeErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('desktop keyboard, pause, ferry adventure, and ordinary-origin save/reload', async ({ page }, testInfo) => {
  const errors = runtimeErrors(page);
  await begin(page, testInfo);

  const initial = await snapshot(page);
  await page.keyboard.down('d');
  try {
    // Keep the real key held until normal simulation frames produce movement.
    // A fixed wall-time hold is unreliable with a slow software WebGL renderer.
    await stateMatches(page, (s) =>
      Math.hypot(s.player.x - initial.player.x, s.player.z - initial.player.z) > 0.3,
    'Keyboard input should actually move the explorer', 15_000);
  } finally {
    await page.keyboard.up('d');
  }

  await selectPlace(page, 'portal');
  await stateMatches(page, (s) => Boolean(s.player.target), 'Choosing a place should initiate a real walk');
  await command(page, 'pause');
  await stateMatches(page, (s) => s.paused, 'Pause should suspend the simulation');
  const paused = await snapshot(page);
  await page.waitForTimeout(400);
  const stillPaused = await snapshot(page);
  expect(stillPaused.player.x).toBe(paused.player.x);
  expect(stillPaused.player.z).toBe(paused.player.z);
  await page.keyboard.press('Escape');
  await stateMatches(page, (s) => !s.paused, 'Escape should resume the paused adventure');
  await arrive(page, 'portal');
  await action(page, 'enter-stream');

  const result = await completeAdventure(page, 'ferry', testInfo);
  const beforeReload = await snapshot(page);
  expect(beforeReload.history.length).toBeGreaterThan(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBeTruthy();

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('[data-command="begin"]')).toContainText('Continue');
  await command(page, 'begin');
  await stateMatches(page, (s) =>
    s.scene === 'garden' && s.star === 'nest' && s.ferry.complete &&
    s.deliveryRoute === 'ferry' && s.garden.placements[result.plot] === result.feature,
  'A normal reload should preserve the completed quest, crossing, and garden');
  expect((await snapshot(page)).history.length).toBeGreaterThanOrEqual(beforeReload.history.length);
  expect(errors).toEqual([]);
});

test('desktop canopy adventure provides a second complete solution', async ({ page }, testInfo) => {
  const errors = runtimeErrors(page);
  await begin(page, testInfo);
  await completeAdventure(page, 'canopy', testInfo, { plot: 'plot-2' });
  const state = await snapshot(page);
  expect(state.deliveryRoute).toBe('canopy');
  expect(state.canopy.complete).toBe(true);
  expect(state.ferry.complete).toBe(false);
  expect(state.garden.placements['plot-2']).toBe('arbor');
  expect(errors).toEqual([]);
});

test('touch interface completes the ferry adventure at a narrow mobile viewport', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = runtimeErrors(page);
  try {
    await begin(page, testInfo, true);
    await completeAdventure(page, 'ferry', testInfo, { touch: true, plot: 'plot-3' });
    expect((await snapshot(page)).garden.placements['plot-3']).toBe('pond');
    const pageWidth = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(pageWidth.content).toBeLessThanOrEqual(pageWidth.viewport + 1);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('malformed local save recovers without crashing or claiming completed progress', async ({ page }, testInfo) => {
  const errors = runtimeErrors(page);
  const brokenSave = '{this is not valid saved JSON';
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: SAVE_KEY, value: brokenSave });
  await begin(page, testInfo);
  const state = await snapshot(page);
  expect(state.star).toBe('basket');
  expect(state.ferry.complete).toBe(false);
  expect(state.canopy.complete).toBe(false);
  expect(Object.values(state.garden.placements).every((value) => value === null)).toBe(true);
  expect(await page.evaluate((key) => localStorage.getItem(`${key}.recovery`), SAVE_KEY)).toBe(brokenSave);
  await enterStream(page);
  await go(page, 'star');
  await action(page, 'pick-up-star');
  await stateMatches(page, (s) => s.star === 'carried', 'Recovery should leave a playable fresh adventure');
  expect(errors).toEqual([]);
});
