# Custom map format, version 2

A map is a UTF-8 JSON document with a maximum encoded size of 327,680 bytes. It contains data only. Import accepts exactly the fields below; unsupported fields, versions, dimensions, terrain codes, control characters in names/authors (and controls other than newline, carriage return, or tab in descriptions), and noninteger coordinates are rejected. JSON property order is irrelevant. Use `examples/great-amber-basin.crusader-map.json` as a complete, playable version 2, 128 × 128 example.

| Field             | Value                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `version`         | Integer `2`                                                       |
| `width`, `height` | Equal dimensions of `128`, `256`, or `512`; square maps only      |
| `name`            | Nonblank string, at most 80 UTF-16 code units                     |
| `author`          | String, at most 80 UTF-16 code units; may be empty                |
| `description`     | String, at most 500 UTF-16 code units; may be empty               |
| `terrain`         | Exactly `height` strings, each exactly `width` terrain characters |
| `spawns`          | Object containing exactly `player`, `player2`, and `enemy` points |
| `raid`            | One point                                                         |

A point contains exactly `x` and `y`, both integers from 1 through `width - 2`: 1–126 on a 128 map, 1–254 on a 256 map, or 1–510 on a 512 map. Coordinates start at zero in the top-left. `terrain[y][x]` selects the tile at that coordinate. The outermost grid cells are reserved borders; camps must fit inside them.

| Character | Terrain | Movement                        |
| --------- | ------- | ------------------------------- |
| `s`       | Sand    | Open                            |
| `w`       | Water   | Blocked; buildings prohibited   |
| `g`       | Grass   | Open; supports farms            |
| `t`       | Trees   | Blocked; nearby lumber resource |
| `r`       | Stone   | Blocked; nearby quarry resource |
| `i`       | Iron    | Blocked; nearby mine resource   |
| `p`       | Pitch   | Open; nearby pitch resource     |

## Starter camps and readiness

Each spawn point is the top-left tile of its keep. Custom maps receive a keep, two houses, barracks, market, stockpile, granary, and four troops. Buildings use the same sizes as the game catalog. Relative building positions are: keep `(0,0)`, houses `(-3,1)` and `(4,1)`, barracks `(-3,-3)`, market `(4,-3)`, stockpile `(1,4)`, granary `(-3,4)`. Troops begin at tile centers relative to the anchor at `(0,3)`, `(2,3)`, `(-1,0)`, `(3,0)`.

Readiness checks all three camps even when the selected single-player mode uses fewer factions. Camp building footprints must fit within tiles 1 through `width - 2` on both axes (1–126, 1–254, or 1–510) and avoid water and other camps. Spawn anchors must be at least 14 tiles apart. Starting troops must stand on open terrain outside building footprints. The raid entry must be open ground outside camps. A flood fill over open terrain, with all starting camp building footprints blocked, must connect the raid entry to each camp's four troop entry tiles. These checks diagnose disconnected or unsafe starts; they do not guarantee competitive balance or access for every troop radius.

Missing resources and missing grass, trees, or stone within 18 tiles of a camp produce warnings. Warnings allow play; readiness errors prevent starting or hosting. Review resource access and balance by playtesting.

The three standard presets—**The Great Amber Basin** (Small, 128 × 128), **The Twin Oasis Frontier** (Medium, 256 × 256), and **The Amber Sea Marches** (Large, 512 × 512)—are committed terrain fixtures in `src/game/maps/`. Each preset adds a lumber camp at `(-11,-9)`, quarry at `(8,8)`, and farm at `(-8,-10)` relative to each active faction's keep, plus preset enemy defenses for the selected opponent. This setup requires the preset terrain and all three spawn anchors to match; metadata edits and raid-entry edits preserve it. Changing terrain or a spawn anchor selects the standard custom camp setup. These extra preset outposts are separate from the standard seven-building camp readiness checks.

## APIs and persistence

`parseMap(value)` validates structure, returns a deeply frozen `MapDefinition` (reusing the identity of an already validated immutable map), and permits structurally valid unfinished drafts. `decodeMap(text)` additionally checks the UTF-8 byte limit. `encodeMap(map)` validates and exports readable JSON. `validateMap(map)` returns `{ errors, warnings }` for play readiness. `createGame({ map })` validates and checks readiness before building the realm. Omit `map` to use `SMALL_MAP`, the version 2, 128 × 128 Great Amber Basin preset. `BUILTIN_MAPS` lists `SMALL_MAP`, `MEDIUM_MAP`, and `LARGE_MAP` in increasing size. The editor offers Small (128 × 128), Medium (256 × 256), and Large (512 × 512) templates and blank maps; its zoom and scroll controls allow individual tile editing. Legacy 64 × 64 maps and drafts are unsupported, including imports and browser recovery. Unsupported browser data is preserved; library mutations are blocked to prevent data loss. Failed draft recovery blocks automatic persistence until the user confirms Replace unsupported browser draft; navigation, blur, and edits preserve the original raw draft. The editor’s confirmed Delete unsupported legacy maps action explicitly removes only obsolete version 1 or 64 × 64 entries and preserves all other entries. Supported imported maps keep their dimensions.

Drafts may be stored and exported while readiness errors remain. Starting a single-player realm or hosting a multiplayer room requires readiness. Terrain and anchors become immutable per game; later editor changes do not affect that game or its save.

Map format versions and game save versions are separate: a map with `version: 2` is not a version 2 game save. Game save version 3 embeds the complete validated map, which uses map format version 2 and a supported size. Older game save versions and saves containing 64 × 64 maps are unsupported. All map sizes share a 1,600-building limit across factions, enforced during construction and save loading. Save loading validates embedded map structure and saved entity footprints without requiring an unchanged initial camp, because gameplay may have demolished or rebuilt it.

`mapFingerprint(map)` computes a 64-character lowercase SHA-256 hex digest using `@noble/hashes`. Its input is UTF-8 encoding of `JSON.stringify(parseMap(map))`: validated fields in the parser's fixed order, including metadata, with no whitespace. JSON input field order and formatting therefore do not affect the digest. Results are cached for immutable parser-produced maps. The digest supports content agreement and debugging; it is not an authenticity signature or transport authentication. Full embedded map content remains authoritative.
