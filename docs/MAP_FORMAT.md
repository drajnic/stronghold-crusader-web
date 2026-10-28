# Custom map format, version 1

A map is a UTF-8 JSON document with a maximum encoded size of 16,000 bytes. It contains data only. Import accepts exactly the fields below; unsupported fields, versions, dimensions, terrain codes, control characters in names/authors (and controls other than newline, carriage return, or tab in descriptions), and noninteger coordinates are rejected. JSON property order is irrelevant. Use `examples/amber-valley.crusader-map.json` as a complete, playable example.

| Field             | Value                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `version`         | Integer `1`                                                       |
| `width`, `height` | Integers `64`, `64`                                               |
| `name`            | Nonblank string, at most 80 UTF-16 code units                     |
| `author`          | String, at most 80 UTF-16 code units; may be empty                |
| `description`     | String, at most 500 UTF-16 code units; may be empty               |
| `terrain`         | Exactly 64 strings, each exactly 64 terrain characters            |
| `spawns`          | Object containing exactly `player`, `player2`, and `enemy` points |
| `raid`            | One point                                                         |

A point contains exactly `x` and `y`, both integers from 1 through 62. Coordinates start at zero in the top-left. `terrain[y][x]` selects the tile at that coordinate. The outermost grid cells are reserved borders; camps must fit inside them.

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

Readiness checks all three camps even when the selected single-player mode uses fewer factions. Camp building footprints must fit within tiles 1–62 and avoid water and other camps. Spawn anchors must be at least 14 tiles apart. Starting troops must stand on open terrain outside building footprints. The raid entry must be open ground outside camps. A flood fill over open terrain, with all starting camp building footprints blocked, must connect the raid entry to each camp's four troop entry tiles. These checks diagnose disconnected or unsafe starts; they do not guarantee competitive balance or access for every troop radius.

Missing resources and missing grass, trees, or stone within 18 tiles of a camp produce warnings. Warnings allow play; readiness errors prevent starting or hosting. Review resource access and balance by playtesting.

The frozen built-in Amber Valley terrain, spawn points, and raid entry retain the original remote economy outposts and scenario defenses. This classic setup is selected by comparing gameplay map data, so importing the example or changing only its metadata preserves identical setup. Editing any terrain tile or anchor selects the standard custom camp setup. No imported field grants classic setup privileges.

## APIs and persistence

`parseMap(value)` validates structure, returns a fresh deeply frozen `MapDefinition`, and permits structurally valid unfinished drafts. `decodeMap(text)` additionally checks the UTF-8 byte limit. `encodeMap(map)` validates and exports readable JSON. `validateMap(map)` returns `{ errors, warnings }` for play readiness. `createGame({ map })` clones, validates, and checks readiness before building the realm. Omit `map` to use the built-in map.

Drafts may be stored and exported while readiness errors remain. Starting a single-player realm or hosting a multiplayer room requires readiness. Terrain and anchors become immutable per game; later editor changes do not affect that game or its save.

Game save version 3 embeds the complete validated map. A version 2 save migrates to the literal frozen Amber Valley tile fixture in `src/game/builtin-map.ts`; no terrain generator runs during migration. Save loading validates embedded map structure and saved entity footprints without requiring an unchanged initial camp, because gameplay may have demolished or rebuilt it.

`mapFingerprint(map)` computes a 64-character lowercase SHA-256 hex digest using `@noble/hashes`. Its input is UTF-8 encoding of `JSON.stringify(parseMap(map))`: validated fields in the parser's fixed order, including metadata, with no whitespace. JSON input field order and formatting therefore do not affect the digest. Results are cached for immutable parser-produced maps. The digest supports content agreement and debugging; it is not an authenticity signature or transport authentication. Full embedded map content remains authoritative.
