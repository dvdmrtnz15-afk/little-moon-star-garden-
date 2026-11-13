# Little Moon & the Star Garden

**A little adventure. A world that remembers.**

A playable first chapter of a family storybook RPG. Explore a moonlit garden with Rosalie and Little Moon, help a lost star across a stream, and bring a lasting change home.

## Play

Download [the standalone game](release/Little_Moon_Play.html), then open the downloaded HTML in a JavaScript-enabled desktop browser. Everything needed to play is included: no account, API key, model service, external font, or runtime CDN. GitHub's file viewer displays source rather than executing the game; download the file first.

For development or reliable browser-origin saves:

```sh
npm ci
npm run dev
```

Open http://localhost:4173. Node.js 22 or newer is required for development. Dependencies are pinned in the lockfile. The development server builds the project when it starts; restart it after editing source.

## The first adventure

**The Lantern That Couldn't Get Home** contains a garden hub, two stream banks, Lily and Mono, and two complete solutions:

- **Lily's ferry:** leave a Moonprint on the water petal, ask Lily to prepare the basin, and grow a Sailleaf ferry.
- **Mono's canopy:** remember the moonflower's light, ask Mono to secure an anchor, and connect a Ribbonvine crossing.

Carry the star across, deliver it to its lanternflower, return over your completed crossing, and plant the adventure's gift in the garden. Discovering the other route later unlocks its garden feature too. Existing features can be moved to empty plots.

Moonprints in this first chapter hold an illuminated position the player actually occupied. Movement recording and longer companion plans remain future work. Light enables preparation; completed crossings remain usable after the Moonprint is released. Partial growth can be resumed. Crossing cancellation and interrupted saves recover to a safe bank.

## Controls

| Input | Action |
| --- | --- |
| Click or tap the ground | Walk there on the current bank |
| Click or tap a marked place | Walk to it; interact when nearby |
| Places / M | Navigate using labeled, keyboard-accessible buttons |
| WASD / arrow keys | Move |
| E | Use the first available nearby action |
| R | Remember the light on an occupied moon petal |
| X | Release the current Moonprint |
| Escape / P | Pause; Escape also closes a dialog |
| Touch arrows | Directional movement on touch devices |

The interface supports English and Spanish, reduced decorative motion, optional synthesized sound, optional browser/device speech, replayable guidance, and a factual memory book. Device speech availability varies by browser; the game remains playable without it.

## Saves and offline use

Normal-origin play autosaves to this browser. Settings also offer JSON export/import. Save import validates the schema and physical/progression invariants before replacing the current game. Invalid saves leave the active adventure intact. An unreadable stored save is backed up before a new autosave can overwrite it; if the backup fails, autosave remains paused and export is available.

Browser behavior for local HTML files and private browsing varies. Export a save when moving between browsers, devices, file locations, or origins. No child profile, microphone, camera, analytics service, or external network request is needed during play.

## Build and verification

```sh
npm test                 # Deterministic engine and save integrity tests
npm run build            # dist/ plus release/Little_Moon_Play.html
npm run test:browser     # Full normal-speed UI playthroughs with Playwright
```

Install the test browser once if necessary:

```sh
npx playwright install chromium
```

Playwright uses CHROMIUM_PATH when set, otherwise a system Chromium if available, and its installed browser as a fallback. The test configuration enables ANGLE/SwiftShader for reproducible software WebGL. This does not establish physical-device GPU performance.

CI runs engine tests, a production build, and browser scenarios for both routes, save/reload, pause, touch input, and corrupt-save recovery. It retains the built game and browser evidence as workflow artifacts. See [verification details](docs/VERIFICATION.md) for executed results and limitations.

## Source map

| File | Responsibility |
| --- | --- |
| src/engine.js | Deterministic movement, light, construction, crossings, inventory, progress, and save validation |
| src/world.js | Procedural Three.js dioramas and state-driven world changes |
| src/characters.js | Original procedural character models and animation |
| src/main.js | Public controls, accessibility surfaces, pause, saves, settings, and event feedback |
| src/content.js | English/Spanish UI, authored feedback, and factual memory descriptions |
| src/audio.js | Original local synthesized cues |
| src/fallback.js | Labeled Canvas compatibility map using the same simulation |
| tests/ | Engine tests and browser scenarios using public UI controls |

Edit source files, then rebuild; the standalone HTML is generated. The world uses original procedural artwork. Three.js is MIT-licensed; its notice is included in [THREE_LICENSE.txt](docs/THREE_LICENSE.txt).

## Design direction

[The concept brief](docs/GAME_DESIGN.md) records the larger six-world vision and the source of the first chapter. It is a design snapshot; this README and verification report describe implemented behavior. The first build does not claim the full six-world campaign, simultaneous multiplayer, live generative dialogue, recorded-route Moonprints, or validated educational outcomes.

The preserved ensemble is Rosalie, Little Moon, TonGee, Mono, Deddy, Momo, Batman, Tia, Lily, and Dunz. This chapter fully renders Rosalie, Little Moon, Lily, and Mono. The Amara book remains a separate editorial identity.
