import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
// Committed outputs are loaded directly at runtime. No random or runtime terrain generation.
for (const [size, label, name] of [
  [256, 'medium', 'The Twin Oasis Frontier'],
  [512, 'large', 'The Amber Sea Marches'],
]) {
  let seed = size ^ 0x6a09e667;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const rows = Array.from({ length: size }, () => Array(size).fill('s'));
  const patch = (cx, cy, rx, ry, code) => {
    for (let y = Math.max(1, cy - ry); y <= Math.min(size - 2, cy + ry); y++)
      for (let x = Math.max(1, cx - rx); x <= Math.min(size - 2, cx + rx); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) rows[y][x] = code;
  };
  const spawns = {
    player: { x: 32, y: size - 40 },
    player2: { x: size - 40, y: size - 40 },
    enemy: { x: size - 40, y: 32 },
  };
  // Distinct chains of lake basins leave wide east-west and north-south corridors.
  const lakes =
    size === 256
      ? [
          [72, 65, 19, 13],
          [159, 142, 24, 16],
        ]
      : [
          [103, 97, 41, 27],
          [327, 115, 33, 48],
          [180, 325, 48, 31],
          [379, 350, 30, 43],
        ];
  for (const [x, y, rx, ry] of lakes) {
    patch(x, y, rx + 9, ry + 9, 'g');
    patch(x, y, rx, ry, 'w');
  }
  // Stratified, seeded sites cover the frontier without repeating a visible grid.
  // Irregular grass lobes and rotated resource groups leave broad paths between sites.
  for (let baseY = 45; baseY < size - 25; baseY += 47)
    for (let baseX = 43; baseX < size - 25; baseX += 53) {
      const x = baseX + between(-17, 17),
        y = baseY + between(-15, 15);
      if (random() < 0.14) continue;
      if (Object.values(spawns).some((p) => Math.hypot(p.x - x, p.y - y) < 35)) continue;
      if (rows[y][x] === 'w') continue;
      const angle = random() * Math.PI * 2;
      const offset = (distance, turn) => [
        x + Math.round(Math.cos(angle + turn) * distance),
        y + Math.round(Math.sin(angle + turn) * distance),
      ];
      const grassX = between(6, 12),
        grassY = between(4, 9);
      patch(x, y, grassX, grassY, 'g');
      const [gx, gy] = offset(between(3, 7), 0.7);
      patch(gx, gy, between(4, 8), between(3, 6), 'g');
      const [tx, ty] = offset(between(10, 15), 0);
      patch(tx, ty, between(3, 6), between(3, 7), 't');
      patch(tx + between(-3, 3), ty + between(-3, 3), between(2, 4), between(2, 4), 't');
      const [rx, ry] = offset(between(11, 17), between(18, 24) / 10);
      patch(rx, ry, between(3, 5), between(2, 5), 'r');
      const [mx, my] = offset(between(11, 16), between(39, 47) / 10);
      patch(mx, my, between(2, 4), between(2, 4), random() < 0.6 ? 'i' : 'p');
    }
  for (const { x, y } of Object.values(spawns)) {
    patch(x, y, 23, 23, 's');
    patch(x - 8, y - 10, 6, 6, 'g');
    patch(x - 15, y - 9, 5, 5, 't');
    patch(x + 11, y + 8, 4, 4, 'r');
    patch(x + 13, y - 10, 3, 3, 'i');
    patch(x - 11, y + 13, 3, 3, 'p');
    for (let py = y - 5; py <= y + 7; py++)
      for (let px = x - 5; px <= x + 7; px++) rows[py][px] = 's';
  }
  const map = {
    version: 2,
    width: size,
    height: size,
    name,
    author: 'David Rajnic',
    description:
      size === 256
        ? 'Two great oases and a chain of frontier settlements surround broad desert approaches.'
        : 'Four great lake basins and scattered resource frontiers span the Amber Sea marches.',
    terrain: rows.map((r) => r.join('')),
    spawns,
    raid: { x: 5, y: 5 },
  };
  writeFileSync(
    new URL(`../src/game/maps/${label}.json`, import.meta.url),
    JSON.stringify(map, null, 2) + '\n',
  );
}
