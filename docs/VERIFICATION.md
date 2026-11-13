# Verification — first playable chapter

## Executed locally

- 27 deterministic engine tests passed on November 13, 2026.
- Production bundle and offline standalone HTML built successfully.
- Source syntax and whitespace checks passed.

Engine coverage includes both full routes through star delivery, return crossing, garden placement and reload; actual pad occupancy; no remote Moonprint; companion prerequisites; interrupted growth; persistent finished crossings; safe traversal cancellation/reload; pause; both rewards; rearrangement; duplicate-star prevention; corrupt-save rejection; bounded event history; and deterministic replay of the same public commands.

## Browser verification

The local command environment prevented Chromium from creating required sockets. The supported escalation was rejected by the environment policy. The managed browser also rejected local file URLs. These are recorded environment limitations, not passed browser tests.

The committed GitHub Actions workflow is the intended HTTP-origin execution environment for the four browser scenarios. Results will be recorded after it runs; test discovery alone is not a pass.

Browser scenarios use visible controls and normal-speed movement. A read-only snapshot API observes results; tests do not teleport the player, dispatch internal actions, or write completion flags. The corruption scenario deliberately writes malformed save bytes before launch.

## Acceptance boundaries

- Headless SwiftShader, when executed, verifies the WebGL code path using software rendering. Physical iPad/iPhone/desktop GPU performance remains untested.
- Touch emulation does not establish testing on a physical device.
- The Canvas compatibility renderer is separately labeled; it is never substituted as evidence that WebGL passed.
- Full screen-reader usability, WCAG conformance, family playtests, and educational outcomes require dedicated validation.
- No production deployment or storefront publication is part of this change.

## Recovery and rollback

The game uses a versioned save format. Invalid imports preserve current state. Unreadable browser saves are backed up or retained without overwrite. JSON export supports moving between origins or preserving a garden before restart.

The implementation is isolated on a feature branch. Reverting its commits restores the initial repository; saves remain local to each browser and are not modified by a repository rollback. Keep a downloaded JSON save before changing incompatible future versions.
