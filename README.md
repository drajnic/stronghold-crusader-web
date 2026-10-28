# Stronghold Crusader — The Amber Valley

A private, original browser RTS demonstration inspired by classic castle strategy. The requested title is used for this local demo; this is not the commercial game or an official product. All buildings, terrain, soldiers, interface illustrations and sounds are created in code. No copyrighted game assets, fonts, audio, or external services are included. Development tools are local, locked pnpm dependencies; the production host uses Node built-ins and a browser-compatible SHA-256 library for map fingerprints.

## Author and license

Created by **David Rajnic** ([rajnic.david@live.com](mailto:rajnic.david@live.com)). Copyright © 2026 David Rajnic. Licensed under the [MIT License](LICENSE).

## Run locally

Use Node.js **22.13+ in the 22.x line, or 24+**, and **pnpm 11.25.0** (pinned in `packageManager`). The configured toolchain requires these versions. Install Node.js and pnpm so both commands are available on `PATH`. Runtime and asset paths resolve from the repository or module location; no machine-specific runtime installation is required.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:4173**. Vite serves the browser with hot updates; the authoritative game host listens on **127.0.0.1:4174**. Vite proxies `/api`, including unbuffered SSE, to that host so browser requests remain on one origin. `Ctrl+C` stops both supervised processes. `./start.sh` is a convenience alias for `pnpm dev` that runs from the repository directory.

CSS changes update without discarding a running kingdom. Changes to TypeScript modules reload the browser; `tsx watch` restarts the authoritative host when its game/protocol code changes. Rooms live in memory, so a host restart ends them and the client returns to the menu with a connection notice. Local saves and campaign progression remain in browser storage.

For an optimized production build and local static host:

```sh
pnpm build
pnpm start
```

The build first typechecks, then writes browser assets to `dist/client` and the bundled Node host to `dist/server/entry.js`. Production serves generated assets only; it never serves source TypeScript or `work/`. It uses **http://127.0.0.1:4173** by default. Change its port with `PORT=4180 pnpm start`. Install/build tools and pnpm caches stay inside the repository (`node_modules` and `work/`); project dependencies need no global installation.

## Game modes

| Mode           | Rules                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skirmish       | Build a settlement and army, defeat a rival lord’s keep. Three difficulties change the rival’s pressure.                                            |
| Campaign       | Three scenarios: a four-raid defense, a rival citadel, and a five-raid frontier defense. Winning unlocks the next scenario in this browser.         |
| Castle Builder | Peaceful construction without timed raids. The manual invasion button calls a real army when ready. Resources and workers still matter.             |
| Survival       | Repel four increasingly strong raids while protecting the keep.                                                                                     |
| Multiplayer    | Two human players, co-op against an AI lord or versus each other. Real server rooms, authoritative simulation, live commands and reconnect support. |

Losing your keep loses your realm. In co-op, both allied keeps must fall for the team to lose. In versus, the last surviving lord wins. There is no fog of war: all armies and settlements are visible.

## Custom maps

Open **Map editor** from the main menu to paint a 64 × 64 map, choose terrain brushes, and place the three faction starts and raid entry. Name the map and optionally add an author and description. Readiness messages identify unsafe camps, blocked approaches and disconnected starts; warnings flag resource concerns. Drafts may be saved and exported while errors remain, but starting or hosting requires a playable map.

Save maps in the browser's local library, then choose one in the local game or multiplayer map selector. Editor changes do not alter an existing game. Import and export use `.crusader-map.json` files; imports are limited to 16,000 UTF-8 bytes. The library stays in this browser. Export files to back up or share maps, especially before clearing browser storage. Importing a file validates data and does not execute code.

See [the map format and validation rules](docs/MAP_FORMAT.md) and [the complete Amber Valley example](examples/amber-valley.crusader-map.json). The built-in map remains available without library storage.

## Controls

- **Left-click** a friendly soldier to select; **drag** to select a group. **Shift** adds to a selection. Click a building’s body, roof or foundation to inspect it.
- **Right-click ground** to move. **Right-click hostile troops or buildings** to attack that target. **A, then click** issues attack move. Selected units also have movement and stance buttons. Aggressive, defensive and hold stances affect targeting and movement.
- **Right-click a friendly tower**, or **G then click**, to garrison selected ranged troops. They must be within twelve tiles and fit its six slots. Select the tower and choose Ungarrison to release them. Adjacent tower stairs further extend garrison range.
- **Ctrl+1–9** or **Command+1–9** saves the selected control group; **1–9** recalls it. Groups belong to the current session.
- Choose a construction, then click valid ground. **Drag a wall line** to construct multiple sections. **Escape** or right-click cancels placement. The placement preview explains invalid ground, missing resources and terrain requirements.
- **WASD / arrow keys** pan. **Middle-drag** pans. **Wheel** zooms around the cursor. **H** centers on your keep. Click the minimap to travel.
- **Space** pauses a local game. Buttons choose 1×, 2× or 3×. Local menus and the guide pause simulation. Multiplayer keeps running while inspecting panels, and exposes no pause, speed, save or load controls.
- **Escape** cancels an order or selection, then opens the menu. The crest also opens the menu. In multiplayer, Escape and the crest open a Resume / Leave overlay. Leaving requires an explicit confirmation and ends an active room for both players.

The menu has settings for camera speed and optional original synthesized interface sounds. Sound starts off. Browser settings and campaign unlocks persist locally.

## Economy and strategy

The starter settlement has working resource buildings, a recruiting facility, equipment and soldiers. Grow housing to make room for additional civilians. Production is allocated workers in building order; understaffed buildings work at a fraction of their output. Select a production building to see its workers, inputs, outputs, staffing, effective output and missing inputs. **Pause work / Resume work** releases or restores a workplace’s labor demand; paused workplaces consume no production inputs and produce no output. Idle mills, workshop smoke and working villagers stop animating.

The resource header shows wood, stone, food and gold with net income per second. **Stockpile** opens every resource, weapon and production intermediate. Raw materials, food-chain goods and equipment each have storage limits; stockpiles, granaries and armories expand their respective capacity. Production stops when storage is full. A marketplace enables buying and selling actual goods for the displayed gold prices.

Production chains include:

- Trees → woodcutter → wood; nearby rock → quarry → stone; ore → iron mine → iron; tar pits → pitch rig → pitch.
- Fertile land → date orchard → food. Wheat farm → mill → flour → bakery → food.
- Hop farm → brewery → ale → staffed inn → popularity.
- Wood → fletcher → bows and crossbows. Wood → poleturner → spears and pikes.
- Iron → blacksmith → swords and maces. Iron → armorer → plate armor.
- Food and gold → tanner → leather. Food → stable → horses.

Recruitment consumes real equipment, gold and civilians. European troops require a barracks; mercenaries require a mercenary post; siege engines require a siege workshop and two civilians. The ledger disables unavailable recruitment and explains the actual unmet requirement. The catalog includes archers, crossbowmen, spearmen, pikemen, macemen, swordsmen, knights, Arabian troops, horse archers, assassins, fire throwers, catapults, trebuchets, rams and ballistas.

Select a barracks, mercenary post or siege workshop and choose **Set rally**, then click a destination; Escape cancels. **Clear rally** removes the destination for future recruits; soldiers already recruited keep their current orders. A selected facility shows its rally flag and line. Recruiting a matching troop while its facility is selected uses that facility; generic ledger recruitment still chooses an available facility. Recruits travel to the rally point using ordinary movement and collision rules.

Tax raises revenue and reduces popularity. Gifts consume gold and improve it. More rations consume food and raise popularity; hunger sharply reduces it. Staffed chapels and ale supplied to inns add bonuses. Gardens add kind rule; gallows add fear. Their net balance is capped at −5 to +5: each kind level adds 2 popularity and 5% troop damage while reducing industrial productivity by 5%; fear reverses these effects. Faith and ale services retain their own staffing rules. The sidebar shows the shared popularity target, its contributions, and the rule balance with productivity and troop damage. Popular citizens arrive when there is capacity; very unhappy citizens leave.

Soldiers occupy physical ground footprints: infantry, cavalry, and siege engines keep clear of one another, solid buildings, and visible trees, stone, and iron deposits. Movement follows collision-safe paths, recruitment and tower exits need clear ground, and gates cannot close over soldiers. Open gates and pitch traps remain traversable, including where construction clears resource scenery. Local saves repair legacy overlaps; multiplayer snapshots keep the host’s authoritative coordinates.

Walls and moats block movement. **Open gates allow every army through; closed gates block every army.** Enemies can attack blocking fortifications. Towers have a small automatic sentry; actual ranged garrisons give stronger protection. Repair restores a building for wood and stone after it has been out of combat for six seconds. Demolition returns part of its remaining value. Pitch traps burn once against nearby hostiles and can ignite nearby flammable buildings, including friendly buildings. Walls, closed gates, keeps and towers block ground ranged fire. Tower sentries and shots to or from elevated garrisons clear low walls and gates, while intervening keeps and towers still block those shots. Ground-level shots at a tower’s foundation remain blocked by walls and closed gates. Catapults and trebuchets arc over these obstacles.

Building fires from slaves, fire throwers and pitch traps burn at 6 HP per second for up to 24 seconds without suppression. A nearby burning building can ignite them again after the fire ends. Fire spreads to adjacent flammable buildings regardless of ownership; a full tile of open ground stops this natural spread. Pitch traps ignite buildings within a 1.5-tile radius and can jump that single-tile gap, so keep them farther from vulnerable buildings. Burning workplaces stop working, recruiting facilities cannot recruit, and repairs must wait until the fire is out and the building has been out of combat for six seconds. Stone fortifications and wells are immune.

Wells cost 20 wood and 10 stone, occupy one tile, and need two workers. Each active well suppresses one nearest burning building within seven tiles of its center, shortening the fire in proportion to staffing. Several wells can help the same fire. Wells help your buildings and explicit co-op allies; paused or unstaffed wells provide no help. Selecting or placing a well shows its range. Coverage is an abstract radius, without individual water hauling, and does not guarantee every fire is being suppressed.

Enemy lords rebuild missing essential industries, adjust food and tax policy, buy missing supplies from their own treasury, repair safe buildings and recruit mixed armies. Nearby threats pull reserves back to defend the keep. The Emir takes a balanced approach; the Wolf launches faster raids at exposed industries; the Warden reserves more defenders, garrisons towers and waits for larger expeditions with siege escorts. Gardens and gallows also reflect their preferred rule.

A practical opening: keep food and housing ahead of population, add workers before many industries, build a marketplace to fill urgent equipment shortages, and protect the approaches with ranged troops in towers. Armored troops resist arrows; crossbows and siege engines help break stronger defenses. Rams attack fortifications at close range; trebuchets are slow but have long range.

## Real multiplayer and LAN play

1. Start development with `pnpm dev`, or use `pnpm build` followed by `pnpm start`.
2. Open **Multiplayer**, enter a name, choose **Co-op** or **Versus** and a map, and select **Create a room**.
3. Open a second independent browser tab/window and join using the displayed six-character code. Each tab stores its own session token. The second player uses the blue realm; the host uses teal.
4. Once both players are connected, the host selects **Begin the battle**. Each player commands only their own troops, buildings, treasury and policies. The map and simulation are shared.

For two computers on a trusted LAN, run:

```sh
pnpm build
HOST=0.0.0.0 pnpm start
```

Both players open `http://HOST_LAN_ADDRESS:4173`, using the actual host computer’s LAN address. Allow the chosen port through the local firewall if required. The default host binds only to localhost. The LAN option is intended for trusted local play; there is no account service, public lobby discovery or Internet relay.

The server advances the simulation at fixed 50 ms steps and broadcasts snapshots approximately five times per second. Browser clients submit validated intents and render server snapshots; they never advance online gameplay locally. Unit positions interpolate visually between snapshots. Ownership validation rejects commands against the other player’s entities. Rooms remain in the lobby until the host starts them. The host's selected map is authoritative in both modes. The server validates and freezes it before creating a room; guests do not need to install it. The lobby shows its name, dimensions and SHA-256 fingerprint. Either player can use **Download shared map** to save a copy without changing their local library. Full map content is sent on join and reconnect; subsequent SSE snapshots carry its fingerprint and dynamic game state without repeating terrain. A guest's local map choice cannot replace the host's map. Creation requests are limited to 32 KiB; other JSON requests remain limited to 16 KiB.

Closing a player tab pauses the battle, and refreshing that same tab restores its session while the reconnect grace is active. Reopen or refresh within thirty seconds. A player explicitly leaving an active battle, or exceeding the grace period, ends the room. In the lobby, a guest leaving frees the slot for another guest; the host leaving closes the room. Idle rooms expire. Tokens are per-tab session storage and never included in public room snapshots. This version has no spectators, chat, matchmaking, late joining or saved online matches.

## Saves and campaign progression

**Save / Load** preserve one local kingdom in browser storage. They are unavailable online. Version 3 embeds the complete map along with factions, production equipment, gates, garrisons and orders. Version 2 saves remain loadable and migrate to the frozen built-in Amber Valley map. Custom-map saves do not depend on the map remaining in the local library. Invalid saves are rejected before replacing the current kingdom. Version 1 Saffron Keep saves are detected with a clear incompatibility message; start a new expanded game. Reloading does not automatically load a local save. Campaign unlocks are saved independently. Private browser settings can prevent storage.

## Verification and code

```sh
pnpm check
```

A normal `pnpm install` installs repository-managed Git hooks through `prepare`. For an existing checkout, or after installing with lifecycle scripts disabled, run:

```sh
pnpm hooks:install
```

This sets only this repository's `core.hooksPath` to `.githooks`. Source archives and packages nested inside another Git repository skip setup. Both `pre-commit` and `pre-push` run the full `pnpm check` from the repository root and block the operation if any check fails. Node.js and pnpm must be available on the Git process's `PATH`, including when using a Git GUI.

Hooks check the current working tree; they do not stash, stage, or rewrite source files. Stage the intended files before committing, and rerun checks after any unstaged edits so the checked content matches what you intend to commit. Checks generate the usual ignored reports and build output.

`pnpm check` runs strict TypeScript checking, ESLint with typed promise checks and architecture boundaries, Stylelint, Prettier verification, Knip unused-code/dependency analysis, the test suite, an actual Checkstyle XML report, and the production build. Individual commands are available when iterating:

| Command                             | Purpose                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm typecheck`                    | Strict TypeScript, including tests, with unused locals/parameters rejected     |
| `pnpm lint`                         | ESLint TypeScript rules and standard CSS Stylelint rules                       |
| `pnpm lint:checkstyle`              | ESLint results in `work/reports/checkstyle.xml` for CI consumers               |
| `pnpm format:check` / `pnpm format` | Verify / apply the same Prettier style                                         |
| `pnpm unused`                       | Find unreachable files, unused exports/types and unused dependencies with Knip |
| `pnpm test`                         | Execute typed Node tests through tsx                                           |
| `pnpm build`                        | Typecheck and create the production client/host                                |

Checkstyle is an XML reporting format here, generated by the ESLint formatter for TypeScript. The Java Checkstyle engine does not apply to this project. Generated reports, build output, caches, dependencies, and scratch work are ignored by Git and by formatting/linting where appropriate.

Tests cover production inputs, labor, storage, marketplace costs, popularity/migration, recruiting facilities/equipment, construction, commands, gates, tower garrisons, armor/siege, pathfinding, enemy economy, sandbox invasions, real win/loss, malformed saves, and a complete legal campaign victory. Deterministic command replay snapshots verify gameplay behavior across every mode, including identical repeated runs. Network tests use real ephemeral HTTP hosts and SSE clients to verify faction ownership, independent economies, deduplication, reconnect grace, duplicate-tab isolation, lobby recovery, terminal snapshot hydration, and source/static isolation. Runtime protocol parsers reject malformed messages before rendering.

The code is organized by responsibility:

- `src/game/`: DOM-free typed game domain, split into contracts, catalogs, terrain, economy, construction, pathfinding, commands, combat, simulation, actions, and validated saves. `index.ts` is its public API.
- `src/client/app.ts`: application orchestration. `ui/` contains typed menu, HUD, input, selection, persistence, stockpile, catalog, and connection controllers; `render/` contains drawing, terrain, architecture, soldiers/siege, and scene rendering.
- `src/client/network.ts`: typed HTTP intent/SSE session client with an injectable transport port and per-tab reconnect credentials.
- `src/shared/protocol.ts`: validated room snapshots and action receipt DTOs shared by browser, host, and integration tests.
- `src/server/`: authoritative room lifecycle and simulation host, authentication/ownership rules, bounded HTTP parsing, generated-asset serving, and the production/development entry point.
- `tests/`: strict TypeScript simulation and real HTTP/SSE integration tests.

Client modules cannot import server implementation; the game domain cannot import client, server, or Node modules. Vite handles browser transformation while `tsc` independently enforces types. pnpm's lockfile pins the dependency graph and allows only esbuild's required installation build scripts.

The local QA interface `window.__game` exposes `snapshot()`, `start(options)`, `restart()`, `step(seconds)`, asynchronous `place(type,x,y)`, `recruit(type)`, `command(ids,x,y,targetId)`, `action(action)`, `save()`, `load(raw)`, `team()` and a compact `network()` status. Online step/save/load cannot modify server gameplay. Snapshot objects are copies. These are developer inspection helpers, not player controls.

## Scope and differences from the original game

This is a playable expansion of a small original prototype, not full commercial Stronghold Crusader parity. It includes a 64×64 map, 35 building types, 18 recruitable troop types, production chains, castle defense, enemy settlement AI, three local campaign scenarios and genuine two-player co-op/versus rooms.

Intentional gaps include the original campaign and maps, historical presentation, proprietary art/audio/voices, complex civilian navigation and hauling, lord avatars, detailed siege deployment crews, wall walking, ladders, tunnelers, fog of war, diplomacy, multiplayer chat/matchmaking, larger player counts, pathfinding at commercial scale and online persistence. Working villagers are animated representations of the simulated workforce rather than individually routed resource haulers. Some production, combat and recruitment rules are deliberately simplified. The soundtrack is absent; optional sounds are short original interface tones.

Nothing is published by this project. Run and review locally.
