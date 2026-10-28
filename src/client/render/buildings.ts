import { drawBuildingFire } from './building-fire.js';
import { archedDoor, arrowLoop, castBuildingShadow, windowOpening } from './architecture.js';
import { barrel, cart, crate, logPile, pot, sack } from './props.js';
import type { Building, GameState } from '../../game/index.js';
import { TYPES } from '../../game/index.js';
import { DrawingSurface, teamColor } from './drawing.js';
import { horse } from './units.js';
/** Ground-only pass: the scene draws these before any depth-sorted silhouettes. */
export function buildingShadow(r: DrawingSurface, b: Building): void {
  const { x, y, type } = b,
    size = TYPES[type].size;
  castBuildingShadow(
    r,
    x,
    y,
    size,
    type === 'keep'
      ? 100
      : type === 'tower' || type === 'chapel'
        ? 92
        : ['farm', 'wheatfarm', 'hopsfarm', 'moat', 'pitchtrap', 'garden'].includes(type)
          ? 16
          : 48,
  );
}
export function building(r: DrawingSurface, b: Building, s: GameState) {
  r.roofPlane.valid = false;
  r.activeTeamColor = teamColor(b.team);
  const { x, y, type } = b,
    z = r.camera.zoom,
    d = TYPES[type],
    size = d.size;
  r.ground(x - 0.035, y - 0.035, size + 0.07, size + 0.07, '#75624745');
  if (type === 'keep') {
    r.ground(x - 0.25, y - 0.25, 3.5, 3.5, '#aa9468');
    r.prism(x + 0.3, y + 0.3, 2.4, 2.4, 44, '#cdbb90', '#bca176', '#9f845a');
    r.roof(x + 0.2, y + 0.15, 2.5, 2.5, 27, 44, '#996a45');
    r.tower(x - 0.12, y - 0.12, 0.85, 76, s.time);
    r.tower(x + 2.3, y - 0.12, 0.85, 76, s.time);
    r.tower(x - 0.12, y + 2.3, 0.85, 68, s.time);
    r.tower(x + 2.3, y + 2.3, 0.85, 68, s.time);
    r.prism(x + 1.15, y + 2.72, 0.7, 0.12, 26, '#695136', '#59412d', '#493626');
    archedDoor(r, x + 1.5, y + 2.85, 0, 0.68, 28);
    r.prism(x + 1.05, y + 2.9, 0.9, 0.3, 3, '#d5c49c', '#a99570', '#8d7858');
    windowOpening(r, x + 1.5, y + 2.72, 31);
    windowOpening(r, x + 2.71, y + 1.5, 28, 'right');
  } else if (type === 'tower') r.tower(x + 0.25, y + 0.25, 1.5, 86, s.time);
  else if (type === 'wall') {
    r.prism(x + 0.02, y + 0.02, 0.96, 0.96, 30, '#c5b58e', '#b9a27b', '#95805d');
    for (let i = 0; i < 3; i++) {
      r.prism(x + i * 0.34, y, 0.19, 1, 8, '#d6c49e', '#c0ab81', '#a28b63', 30);
    }
    for (let h = 10; h < 30; h += 10) {
      r.line(r.project(x, y + 1, h), r.project(x + 1, y + 1, h), '#8e7956', 0.7);
      r.line(r.project(x + 1, y, h), r.project(x + 1, y + 1, h), '#776648', 0.7);
    }
  } else if (type === 'gate') {
    r.prism(x, y + 0.65, 2, 0.7, 42, '#cdbd92', '#b59d73', '#97825e');
    if (!b.open) r.prism(x + 0.55, y + 1.36, 0.9, 0.02, 29, '#6c4b2a', '#765634', '#5c4027');
    for (let i = 0; i < 5; i++)
      if (!b.open)
        r.line(
          r.project(x + 0.65 + i * 0.17, y + 1.38, 1),
          r.project(x + 0.65 + i * 0.17, y + 1.38, 28),
          '#332a22',
          1.4,
        );
    archedDoor(r, x + 1, y + 1.375, 0.5, 0.85, 31, !b.open);
    r.tower(x, y, 0.6, 51, null);
    r.tower(x + 1.4, y + 0.8, 0.6, 51, s.time);
  } else if (type === 'farm') {
    r.ground(x, y, 3, 3, '#92905a', '#706a43');
    // Date palms grow beside shallow irrigation furrows; wheat has its own separate field.
    for (const row of [0.45, 1.4, 2.35]) {
      r.ground(x + 0.12, y + row, 2.7, 0.1, '#526f59');
      r.line(
        r.project(x + 0.12, y + row + 0.12),
        r.project(x + 2.82, y + row + 0.12),
        '#c4b16f',
        1.2,
      );
    }
    r.ground(x + 1.45, y + 0.1, 0.15, 2.75, '#a78f5e');
    for (const [u, v] of [
      [0.4, 0.6],
      [0.8, 1.5],
      [0.4, 2.5],
    ]) {
      const q = r.project(x + u, y + v);
      r.ellipse(q.x, q.y, 13, 5, '#667c4b');
      r.ellipse(q.x + 2 * z, q.y + 1 * z, 7, 2, '#aa9b60');
    }
    r.prism(x + 1.9, y + 0.05, 0.85, 0.85, 15, '#c8b78b', '#b09b6f', '#957c53');
    r.roof(x + 1.85, y, 1, 0.95, 12, 15, '#967044');
    r.tree(x + 0.05, y + 0.3, s.time);
  } else if (type === 'house') {
    r.prism(x + 0.2, y + 0.3, 1.6, 1.4, 25, '#dac99c', '#c3ad7d', '#a38c5f');
    r.roof(x + 0.08, y + 0.18, 1.84, 1.65, 20, 25);
    r.prism(x + 1.2, y + 0.7, 0.22, 0.25, 44, '#ddc69b', '#c3a87d', '#997d53');
    archedDoor(r, x + 1.1, y + 1.72, 0, 0.35, 17);
    windowOpening(r, x + 0.5, y + 1.72, 12, 'front', true);
    windowOpening(r, x + 1.8, y + 0.8, 12, 'right', true);
    r.prism(x + 0.25, y + 1.4, 0.35, 0.35, 4, '#b78047', '#8b5d34', '#704929');
  } else if (type === 'barracks') {
    r.prism(x + 0.05, y + 0.1, 1.9, 1.8, 32, '#c7b58a', '#b0996e', '#8f7752');
    r.roof(x, y, 2, 1.9, 17, 32, '#785044');
    r.banner(x + 0.5, y + 0.7, 54, s.time);
    archedDoor(r, x + 1, y + 1.92, 0, 0.62, 26);
    windowOpening(r, x + 0.37, y + 1.92, 17);
    windowOpening(r, x + 1.95, y + 0.85, 17, 'right');
    for (let i = 0; i < 4; i++) {
      const p = r.project(x + 0.2 + i * 0.3, y + 2, 20);
      r.line(p, { x: p.x + 4 * z, y: p.y - 18 * z }, '#5c4c35', 1.5);
    }
  } else if (type === 'market') {
    r.prism(x + 0.05, y + 0.05, 1.9, 1.9, 17, '#c6ac7d', '#b29564', '#927344');
    for (let i = 0; i < 4; i++)
      r.poly(
        [
          r.project(x + i * 0.5, y, 38),
          r.project(x + (i + 1) * 0.5, y, 38),
          r.project(x + (i + 1) * 0.5, y + 2, 22),
          r.project(x + i * 0.5, y + 2, 22),
        ],
        i % 2 ? '#c18a4a' : '#e5d5a2',
      );
    r.line(r.project(x, y + 2), r.project(x, y + 2, 24), '#6e5537', 2);
    r.line(r.project(x + 2, y + 2), r.project(x + 2, y + 2, 24), '#6e5537', 2);
    for (let i = 0; i < 4; i++) {
      const p = r.project(x + 0.3 + i * 0.45, y + 1.9, 14);
      r.ellipse(p.x, p.y, 5, 4, ['#a35d3b', '#c8a14a', '#6b7450', '#ac6a3e'][i]);
    }
  } else if (type === 'lumber') {
    r.prism(x + 0.7, y + 0.2, 1.1, 1.3, 22, '#b89a67', '#907046', '#705534');
    r.roof(x + 0.6, y + 0.1, 1.3, 1.5, 15, 22, '#84704a');
    for (let i = 0; i < 5; i++) {
      r.prism(x + 0.05, y + 0.8 + i * 0.22, 0.48, 0.17, 7, '#b18a52', '#8f6539', '#684a2c');
    }
    const p = r.project(x + 1.5, y + 1.7);
    r.ellipse(p.x, p.y, 10, 5, '#c0a477');
  } else if (type === 'quarry') {
    r.ground(x, y, 2, 2, '#a0957c');
    for (let i = 0; i < 6; i++)
      r.prism(
        x + 0.12 + (i % 3) * 0.5,
        y + 0.3 + Math.floor(i / 3) * 0.8,
        0.4,
        0.6,
        9 + (i % 2) * 4,
        '#c3bca3',
        '#a6a18e',
        '#817d6d',
      );
    r.line(r.project(x + 0.3, y + 0.3), r.project(x + 0.3, y + 0.3, 50), '#705635', 4);
    r.line(r.project(x + 0.3, y + 0.3, 48), r.project(x + 1.7, y + 0.3, 42), '#705635', 4);
    r.line(r.project(x + 1.5, y + 0.3, 42), r.project(x + 1.5, y + 0.3, 12), '#554b36', 1);
    r.line(r.project(x + 0.3, y + 0.3, 20), r.project(x + 1.5, y + 0.3, 43), '#826b44', 2);
  } else expandedBuilding(r, b, s);
  facadeDetails(r, b, s);
  if (b.fire) drawBuildingFire(r, b, s);
  if (!['wall', 'moat', 'stairs', 'pitchtrap'].includes(type)) {
    const q = r.project(x + size * 0.48, y + size, 9);
    r.line({ x: q.x - 4 * z, y: q.y }, { x: q.x + 4 * z, y: q.y }, teamColor(b.team), 4);
  }
  if (b.hp < d.hp) {
    const q = r.project(
        x + size / 2,
        y + size / 2,
        type === 'tower' ? 101 : type === 'keep' ? 105 : 60,
      ),
      w = 38 * z;
    r.ctx.fillStyle = '#211d18e8';
    r.ctx.fillRect(q.x - w / 2 - z, q.y - z, w + 2 * z, 6 * z);
    r.ctx.fillStyle = b.hp / d.hp > 0.35 ? '#91ac70' : '#d37356';
    r.ctx.fillRect(q.x - w / 2, q.y, (w * b.hp) / d.hp, 4 * z);
  }
}
function expandedBuilding(r: DrawingSurface, b: Building, s: GameState) {
  const { x, y, type } = b,
    n = TYPES[type].size,
    z = r.camera.zoom,
    p = (a: number, c: number, h = 0) => r.project(a, c, h);
  const farm = ['wheatfarm', 'hopsfarm'].includes(type);
  if (farm) {
    r.ground(x, y, n, n, type === 'hopsfarm' ? '#9b9c5a' : '#b29a55');
    for (let i = 0.25; i < n; i += 0.45) {
      r.line(p(x + i, y + 0.15), p(x + i, y + n - 0.15), '#7e7641', 4);
      for (let j = 0.3; j < n; j += 0.45) {
        const q = p(x + i, y + j, 3);
        r.line(
          q,
          { x: q.x + 2 * z, y: q.y - (type === 'hopsfarm' ? 15 : 7) * z },
          type === 'hopsfarm' ? '#728947' : '#ddbd64',
          2,
        );
      }
    }
    return;
  }
  if (type === 'well') {
    r.ground(x + 0.03, y + 0.03, 0.94, 0.94, '#b3a17b');
    const base = p(x + 0.5, y + 0.5, 0),
      rim = p(x + 0.5, y + 0.5, 14);
    // Elliptical drum, with individual voussoirs following the rim rather than a square basin.
    r.ellipse(base.x, base.y + z, 19, 9, '#65543b45');
    const c = r.ctx;
    c.beginPath();
    c.ellipse(rim.x, rim.y, 16 * z, 7.5 * z, 0, 0, Math.PI);
    c.lineTo(base.x - 16 * z, base.y);
    c.ellipse(base.x, base.y, 16 * z, 7.5 * z, 0, Math.PI, 0, true);
    c.closePath();
    c.fillStyle = '#b6a07a';
    c.fill();
    r.ellipse(rim.x, rim.y, 16, 7.5, '#e0cda3');
    r.ellipse(rim.x, rim.y, 10.5, 4.6, '#443e30');
    r.ellipse(rim.x, rim.y + 1.5 * z, 8.6, 2.7, '#41777b');
    r.line(
      { x: rim.x - 5 * z, y: rim.y + 2 * z },
      { x: rim.x + 4 * z, y: rim.y + 2 * z },
      '#98c2b4',
      0.7,
    );
    if (z > 0.5) {
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        r.line(
          { x: rim.x + Math.cos(a) * 10.7 * z, y: rim.y + Math.sin(a) * 4.8 * z },
          { x: rim.x + Math.cos(a) * 15.8 * z, y: rim.y + Math.sin(a) * 7.3 * z },
          '#968160',
          0.65,
        );
        if (i > 0 && i < 6)
          r.line(
            { x: rim.x + Math.cos(a) * 16 * z, y: rim.y + Math.sin(a) * 7.5 * z },
            { x: base.x + Math.cos(a) * 16 * z, y: base.y + Math.sin(a) * 7.5 * z },
            '#8b7659',
            0.65,
          );
      }
    }
    for (const u of [0.13, 0.87])
      r.line(p(x + u, y + 0.45, 12), p(x + u, y + 0.45, 36), '#755839', 3);
    r.line(p(x + 0.08, y + 0.45, 36), p(x + 0.92, y + 0.45, 36), '#a17a4b', 4);
    r.line(p(x + 0.5, y + 0.45, 35), p(x + 0.5, y + 0.45, 17), '#584936', 1);
    r.line(p(x + 0.25, y + 0.45, 29), p(x + 0.75, y + 0.45, 29), '#594530', 4);
    r.line(p(x + 0.25, y + 0.45, 30), p(x + 0.75, y + 0.45, 30), '#c29a60', 1);
    r.line(p(x + 0.9, y + 0.45, 29), p(x + 0.9, y + 0.45, 23), '#4c4535', 1.5);
    r.line(p(x + 0.9, y + 0.45, 23), p(x + 1, y + 0.45, 23), '#4c4535', 2);

    r.prism(x + 0.62, y + 0.76, 0.2, 0.19, 8, '#b18b55', '#88633c', '#694b2e');
    return;
  }
  if (type === 'garden') {
    r.ground(x + 0.04, y + 0.04, 1.92, 1.92, '#7d925b', '#bbab78');
    r.ground(x + 0.88, y + 0.08, 0.24, 1.84, '#d1bd91');
    r.ground(x + 0.08, y + 0.88, 1.84, 0.24, '#d1bd91');
    for (const [u, v] of [
      [0.25, 0.3],
      [1.4, 0.3],
      [0.25, 1.4],
      [1.4, 1.4],
    ]) {
      r.prism(x + u, y + v, 0.4, 0.35, 3, '#9c7955', '#836343', '#715237');
      for (let i = 0; i < 3; i++) {
        const q = p(x + u + 0.08 + i * 0.12, y + v + 0.18, 7);
        r.ellipse(q.x, q.y, 2.5, 2, i % 2 ? '#e5b777' : '#bd6671');
      }
    }
    r.prism(x + 0.77, y + 0.77, 0.46, 0.46, 7, '#d4c6a4', '#b7aa87', '#95886d');
    const water = p(x + 1, y + 1, 8);
    r.ellipse(water.x, water.y, 7, 3, '#77aaa6');
    r.line(p(x + 1, y + 1, 8), p(x + 1, y + 1, 19), '#abd3c5', 1.5);
    // A light timber pergola shades the rear flowerbeds.
    for (const u of [0.2, 1.8]) r.line(p(x + u, y + 0.18), p(x + u, y + 0.18, 27), '#806640', 2);
    for (let i = 0; i < 5; i++)
      r.line(
        p(x + 0.14, y + 0.08 + i * 0.1, 27),
        p(x + 1.86, y + 0.08 + i * 0.1, 27),
        '#9b8b57',
        2,
      );
    return;
  }
  if (type === 'gallows') {
    r.ground(x + 0.05, y + 0.05, 1.9, 1.9, '#a99370');
    r.prism(x + 0.18, y + 0.3, 1.64, 1.4, 8, '#aa8556', '#87633f', '#684d34');
    for (const u of [0.4, 1.6]) {
      r.line(p(x + u, y + 0.65, 8), p(x + u, y + 0.65, 49), '#735436', 4);
      r.line(p(x + u, y + 1.4, 8), p(x + u, y + 0.65, 30), '#8d6b43', 2);
    }
    r.line(p(x + 0.28, y + 0.65, 49), p(x + 1.72, y + 0.65, 49), '#87613c', 5);
    r.prism(x + 0.65, y + 1.7, 0.7, 0.18, 4, '#b89a69', '#97774d', '#785d3c');
    return;
  }
  if (type === 'moat') {
    r.ground(x + 0.05, y + 0.05, 0.9, 0.9, '#6d694b', '#ba9b64');
    r.ground(x + 0.2, y + 0.2, 0.6, 0.6, '#638a80');
    return;
  }
  if (type === 'pitchtrap') {
    r.ground(x + 0.05, y + 0.05, 0.9, 0.9, '#69533d');
    for (let i = 0; i < 4; i++)
      r.line(p(x + 0.1 + i * 0.2, y + 0.05), p(x + 0.1 + i * 0.2, y + 0.95), '#9c7e51', 2);
    return;
  }
  if (type === 'stairs') {
    for (let i = 0; i < 5; i++)
      r.prism(x + i * 0.18, y, 0.18, 1, 5 + i * 7, '#cfbf97', '#b19d78', '#8e7a59');
    return;
  }
  if (type === 'stockpile') {
    r.ground(x, y, n, n, '#b39b71');
    for (let i = 0; i < 6; i++)
      r.prism(
        x + 0.15 + (i % 3) * 0.52,
        y + 0.3 + Math.floor(i / 3) * 0.7,
        0.42,
        0.55,
        8 + (i % 2) * 7,
        '#c29b5f',
        '#a47c43',
        '#805c35',
      );
    return;
  }
  if (type === 'pitchrig' || type === 'ironmine') {
    r.ground(x, y, n, n, type === 'pitchrig' ? '#5f5b3f' : '#97836c');
    r.prism(x + 0.5, y + 0.5, 1, 0.9, 18, '#af8c58', '#85683f', '#675031');
    r.roof(x + 0.4, y + 0.4, 1.2, 1.1, 15, 18, '#756244');
    r.line(p(x + 0.3, y + 0.2), p(x + 0.3, y + 0.2, 48), '#806440', 4);
    r.line(p(x + 0.3, y + 0.2, 48), p(x + 1.6, y + 0.2, 43), '#806440', 4);
    r.line(p(x + 1.5, y + 0.2, 43), p(x + 1.5, y + 0.2, 5), '#50442d', 1);
    return;
  }
  if (type === 'stable') {
    r.prism(x + 0.1, y + 0.1, n - 0.2, n - 0.2, 24, '#c9b38a', '#b29a6f', '#8f7855');
    r.roof(x, y, n, n, 23, 24, '#9b6240');
    for (let i = 0; i < 3; i++) {
      const q = p(x + 0.5 + i * 0.8, y + n, 12);
      r.ellipse(q.x, q.y, 6, 8, '#51432e');
    }
    horse(r, p(x + n - 0.4, y + n + 0.05), '#a89366', 0);
    return;
  }
  if (type === 'chapel') {
    r.prism(x + 0.2, y + 0.25, 2.6, 2.4, 38, '#dfcea2', '#c9b48b', '#ab946e');
    r.roof(x + 0.1, y + 0.1, 2.8, 2.7, 33, 38, '#a97650');
    r.tower(x + 1.6, y + 0.2, 0.9, 84, null);
    r.line(p(x + 2, y + 0.6, 89), p(x + 2, y + 0.6, 110), '#8b744e', 2);
    r.line(p(x + 1.8, y + 0.6, 104), p(x + 2.2, y + 0.6, 104), '#8b744e', 2);
    return;
  }
  if (type === 'mercenary') {
    r.ground(x, y, n, n, '#b6a373');
    r.prism(x + 0.1, y + 0.1, n - 0.2, n - 0.2, 12, '#c5aa79', '#aa895d', '#886b47');
    r.roof(x, y, n, n, 26, 12, '#807663');
    for (let i = 0; i < 4; i++)
      r.line(
        p(x + i * 0.5, y + n, 12),
        p(x + i * 0.5, y + n / 2, 38),
        i % 2 ? '#cbb889' : '#547b74',
        3,
      );
    r.banner(x + 0.2, y + 0.3, 39, s.time);
    return;
  }
  if (type === 'siege') {
    r.ground(x, y, n, n, '#a8946e');
    r.prism(x + 0.2, y + 0.2, n - 0.4, n - 0.4, 14, '#b69b6d', '#977a4f', '#78603e');
    r.roof(x + 0.05, y + 0.05, n - 0.1, n - 0.1, 20, 34, '#76674c');
    for (const [a, c] of [
      [0.1, 0.1],
      [2.7, 0.1],
      [0.1, 2.7],
      [2.7, 2.7],
    ])
      r.line(p(x + a, y + c), p(x + a, y + c, 34), '#7e643e', 3);
    const q = p(x + 1.5, y + 2.4);
    r.ellipse(q.x, q.y, 12, 5, '#6b5539');
    r.line({ x: q.x - 10 * z, y: q.y }, { x: q.x + 8 * z, y: q.y - 23 * z }, '#c0a477', 4);
    r.banner(x + 0.4, y + 0.4, 56, s.time);
    return;
  }
  const h = type === 'granary' ? 31 : type === 'armory' ? 34 : type === 'inn' ? 35 : 25;
  r.prism(x + 0.13, y + 0.18, n - 0.26, n - 0.32, h, '#d1bd91', '#bca273', '#9b8056');
  r.roof(
    x + 0.03,
    y + 0.05,
    n - 0.06,
    n - 0.1,
    type === 'granary' ? 26 : 18,
    h,
    type === 'armory'
      ? '#747367'
      : type === 'inn'
        ? '#9d6040'
        : type === 'tanner'
          ? '#b49968'
          : '#916d46',
  );
  archedDoor(r, x + n * 0.6, y + n - 0.11, 0, 0.37, 18);
  windowOpening(r, x + 0.4, y + n - 0.11, 13, 'front', true);
  windowOpening(r, x + n - 0.12, y + 0.75, 14, 'right', true);
  if (['blacksmith', 'armorer', 'bakery', 'brewery'].includes(type)) {
    r.prism(x + n - 0.5, y + 0.45, 0.32, 0.4, h + 27, '#bfa67b', '#a1845c', '#866945');
    const q = p(x + n - 0.35, y + 0.6, h + 33);
    for (let i = 0; !b.fire && !b.paused && b.active !== 0 && i < 3; i++)
      r.ellipse(
        q.x + Math.sin(s.time + i) * 3 * z,
        q.y - (i * 7 + ((s.time * 8) % 7)) * z,
        4 + i * 2,
        3 + i * 1.6,
        '#655e4b20',
      );
    if (type === 'blacksmith' || type === 'armorer') {
      r.prism(x + 0.1, y + n - 0.2, 0.6, 0.45, 6, '#7c7766', '#5d5b50', '#494d43');
      const q = p(x + 0.4, y + n - 0.1, 9);
      if (!b.fire && !b.paused && b.active !== 0) r.ellipse(q.x, q.y, 3, 2, '#e29b47');
    }
  }
  if (type === 'mill') {
    r.tower(x + 0.7, y + 0.6, 0.9, 54, null);
    const q = p(x + 1.15, y + 1.1, 65),
      a = !b.fire && !b.paused && b.active !== 0 ? s.time * 0.7 : 0;
    for (let i = 0; i < 4; i++) {
      const v = a + (i * Math.PI) / 2;
      r.line(q, { x: q.x + Math.cos(v) * 30 * z, y: q.y + Math.sin(v) * 30 * z }, '#715c3c', 3);
      r.line(
        { x: q.x + Math.cos(v) * 10 * z, y: q.y + Math.sin(v) * 10 * z },
        { x: q.x + Math.cos(v) * 28 * z + 5 * z, y: q.y + Math.sin(v) * 28 * z },
        '#d8c89b',
        5,
      );
    }
  }
  if (['fletcher', 'poleturner', 'armory'].includes(type)) {
    for (let i = 0; i < 4; i++)
      r.line(p(x + 0.25 + i * 0.28, y + n, 7), p(x + 0.25 + i * 0.28, y + n, 26), '#7d6441', 2);
  }
  if (type === 'inn') {
    r.banner(x + 0.4, y + 0.3, h + 20, s.time);
    for (let i = 0; i < 3; i++) {
      const q = p(x + 0.2 + i * 0.4, y + n);
      r.ellipse(q.x, q.y, 6, 5, '#88643c');
    }
  }
  if (type === 'tanner')
    r.poly(
      [p(x, y + n, 6), p(x + 0.7, y + n, 6), p(x + 0.7, y + n, 24), p(x, y + n, 24)],
      '#ac7b49',
    );
}

/** Large, readable trade-specific props add identity without changing footprint or selection volume. */
function facadeDetails(r: DrawingSurface, b: Building, s: GameState): void {
  const { x, y, type } = b,
    n = TYPES[type].size,
    z = r.camera.zoom,
    p = (u: number, v: number, h = 0) => r.project(x + u, y + v, h);
  if (type === 'wall') {
    if (z > 0.6) {
      arrowLoop(r, x + 0.52, y + 1.01, 21);
      r.line(p(0.03, 1, 29), p(0.97, 1, 29), '#eee0b7', 1.2);
    }
  }
  if (type === 'market') {
    for (let i = 0; i < 4; i++) {
      const a = p(i * 0.5, 2, 23),
        c = p((i + 1) * 0.5, 2, 23);
      r.poly(
        [a, c, { x: c.x, y: c.y + 4 * z }, { x: a.x, y: a.y + 4 * z }],
        i % 2 ? '#a35c36' : '#d8c291',
      );
    }
    r.line(p(0, 2, 22), p(2, 2, 22), '#564630', 1.5);
    pot(r, x + 0.2, y + 1.95);
    pot(r, x + 0.5, y + 2);
    sack(r, x + 1.6, y + 1.98);
    crate(r, x + 1.72, y + 0.08, 0.3, 8);
  } else if (type === 'lumber') {
    logPile(r, x + 0.12, y + 0.62);
    cart(r, x + 0.85, y + 1.6);
    r.line(p(0.5, 1.3, 6), p(0.5, 1.3, 23), '#5f5139', 1.5);
  } else if (type === 'quarry') {
    cart(r, x + 1.1, y + 1.5);
    r.line(p(0.3, 0.3, 48), p(1.6, 0.3, 18), '#aa8a53', 1.2);
    crate(r, x + 0.1, y + 1.6, 0.3, 7);
  } else if (type === 'farm') {
    r.tree(x + 0.4, y + 1.2, s.time);
    r.tree(x + 0.2, y + 2.2, s.time);
    sack(r, x + 2.55, y + 0.5);
    r.line(p(0, 2.95, 3), p(2.9, 2.95, 3), '#8c7749', 1.2);
  } else if (type === 'wheatfarm') {
    sack(r, x + 2.75, y + 2.6);
    sack(r, x + 2.45, y + 2.65);
    r.line(p(0.08, 0, 5), p(0.08, 3, 5), '#a18e55', 1.6);
  } else if (type === 'hopsfarm') {
    for (let i = 0.3; i < n; i += 0.6) {
      r.line(p(i, 0.18, 0), p(i, 0.18, 24), '#a58b56', 1.3);
      r.line(p(i, 2.8, 0), p(i, 2.8, 24), '#a58b56', 1.3);
      r.line(p(i, 0.18, 23), p(i, 2.8, 23), '#718253', 1.5);
    }
  } else if (type === 'stockpile') {
    logPile(r, x + 0.1, y + 0.3);
    crate(r, x + 1.1, y + 0.4, 0.5, 15);
    barrel(r, x + 1.6, y + 1.5);
    sack(r, x + 0.7, y + 1.6);
  } else if (type === 'granary') {
    for (let i = 0; i < 4; i++) sack(r, x + 0.25 + i * 0.35, y + n - 0.03);
    r.line(p(0.1, n - 0.1, 5), p(n - 0.1, n - 0.1, 5), '#73593c', 3);
  } else if (type === 'brewery' || type === 'inn') {
    barrel(r, x + 0.1, y + n - 0.03, 13);
    barrel(r, x + 0.45, y + n + 0.02, 11);
    barrel(r, x + 0.28, y + n - 0.3, 10);
    if (type === 'inn') {
      const sign = p(1.6, n, 28);
      r.line(sign, { x: sign.x, y: sign.y + 9 * z }, '#5d4b30', 1);
      r.poly(
        [
          { x: sign.x - 5 * z, y: sign.y + 7 * z },
          { x: sign.x + 5 * z, y: sign.y + 7 * z },
          { x: sign.x + 5 * z, y: sign.y + 16 * z },
          { x: sign.x - 5 * z, y: sign.y + 16 * z },
        ],
        '#815d36',
        '#d1ac68',
      );
      r.ellipse(sign.x, sign.y + 11 * z, 2.4, 3, '#d3b678');
    }
  } else if (type === 'bakery') {
    sack(r, x + 0.1, y + n - 0.02);
    sack(r, x + 0.42, y + n + 0.03);
    const q = p(1.25, n, 6);
    r.ellipse(q.x, q.y, 7, 3, '#aa8148');
    for (let i = 0; i < 3; i++) r.ellipse(q.x + (i - 1) * 4 * z, q.y - 1 * z, 2.5, 1.8, '#d8b871');
  } else if (type === 'blacksmith' || type === 'armorer') {
    const furnace = p(0.55, n - 0.1, 9);
    r.ellipse(furnace.x, furnace.y, 6, 8, '#40372b');
    if (!b.fire && !b.paused && (b.active ?? 1) > 0.1) {
      r.ellipse(furnace.x, furnace.y + 2 * z, 4, 4, '#b6622e');
      r.ellipse(furnace.x + Math.sin(s.time * 7) * z, furnace.y + 2 * z, 2.5, 3, '#f0bc59');
    }
    r.prism(x + 0.05, y + n - 0.07, 0.48, 0.28, 5, '#7b7c70', '#4f554c', '#373e36', 6);
    r.line(p(0.08, n + 0.1, 12), p(0.5, n + 0.1, 12), '#d8d1b3', 2);
    crate(r, x + 1.45, y + n - 0.15, 0.32, 8);
  } else if (type === 'fletcher') {
    for (let i = 0; i < 3; i++) {
      const q = p(0.3 + i * 0.3, n, 13);
      const c = r.ctx;
      c.beginPath();
      c.arc(q.x, q.y, 7 * z, -1.3, 1.3);
      c.strokeStyle = '#715739';
      c.lineWidth = 1.5 * z;
      c.stroke();
      r.line(
        { x: q.x + 2 * z, y: q.y - 7 * z },
        { x: q.x + 2 * z, y: q.y + 7 * z },
        '#e0d2a7',
        0.5,
      );
    }
    crate(r, x + 1.5, y + n - 0.2, 0.3, 9);
  } else if (type === 'poleturner') {
    for (let i = 0; i < 5; i++) {
      const q = p(0.25 + i * 0.16, n, 4);
      r.line(q, { x: q.x + 3 * z, y: q.y - 26 * z }, '#9c7b4b', 1.5);
      r.line(
        { x: q.x + 3 * z, y: q.y - 24 * z },
        { x: q.x + 3 * z, y: q.y - 29 * z },
        '#c9c9b4',
        1.8,
      );
    }
  } else if (type === 'tanner') {
    pot(r, x + 0.2, y + n);
    pot(r, x + 0.5, y + n);
    barrel(r, x + 1.65, y + n - 0.1, 8);
  } else if (type === 'stable') {
    logPile(r, x + 0.1, y + 2.5);
    sack(r, x + 2.8, y + 2.5);
    r.line(p(0.05, n - 0.05, 11), p(2.5, n - 0.05, 11), '#b39a68', 1.5);
  } else if (type === 'armory' || type === 'barracks') {
    const q = p(0.3, n - 0.05, 17);
    r.poly(
      [
        { x: q.x - 4 * z, y: q.y - 6 * z },
        { x: q.x + 4 * z, y: q.y - 6 * z },
        { x: q.x + 4 * z, y: q.y + 2 * z },
        { x: q.x, y: q.y + 7 * z },
        { x: q.x - 4 * z, y: q.y + 2 * z },
      ],
      teamColor(b.team),
      '#dac394',
    );
    r.line({ x: q.x, y: q.y - 5 * z }, { x: q.x, y: q.y + 5 * z }, '#dbbd74', 1.1);
  } else if (type === 'mercenary') {
    pot(r, x + 0.15, y + 1.8);
    crate(r, x + 1.55, y + 0.2, 0.3, 8);
    r.line(p(0, 2, 2), p(0, 1, 26), '#d6c697', 0.7);
  } else if (type === 'siege') {
    logPile(r, x + 0.15, y + 2.1);
    const q = p(2.3, 2.55, 8);
    r.ctx.beginPath();
    r.ctx.ellipse(q.x, q.y, 10 * z, 12 * z, 0, 0, Math.PI * 2);
    r.ctx.strokeStyle = '#9d7d49';
    r.ctx.lineWidth = 3 * z;
    r.ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      r.line(q, { x: q.x + Math.cos(a) * 9 * z, y: q.y + Math.sin(a) * 11 * z }, '#6c5635', 1.3);
    }
    crate(r, x + 2.5, y + 0.2, 0.35, 9);
  } else if (type === 'chapel') {
    archedDoor(r, x + 1.2, y + 2.66, 0, 0.52, 25);
    const q = p(1.25, 2.67, 47);
    r.ellipse(q.x, q.y, 6, 7, '#796d4d');
    r.ellipse(q.x, q.y, 4.5, 5.5, '#6d8b85');
    r.line({ x: q.x - 4 * z, y: q.y }, { x: q.x + 4 * z, y: q.y }, '#d7bd7b', 1);
    r.line({ x: q.x, y: q.y - 5 * z }, { x: q.x, y: q.y + 5 * z }, '#d7bd7b', 1);
  } else if (type === 'ironmine') {
    cart(r, x + 0.3, y + 1.45);
    crate(r, x + 1.5, y + 1.4, 0.3, 7);
  } else if (type === 'pitchrig') {
    barrel(r, x + 0.3, y + 1.6, 10);
    barrel(r, x + 0.65, y + 1.6, 10);
    r.line(p(0.3, 0.2, 42), p(1.5, 0.2, 12), '#b39b66', 1);
  }
  if (
    b.hp < TYPES[type].hp * 0.78 &&
    z > 0.5 &&
    !['farm', 'wheatfarm', 'hopsfarm', 'garden', 'moat', 'pitchtrap', 'stockpile', 'well'].includes(
      type,
    )
  ) {
    const q = p(n * 0.73, n - 0.08, 22),
      f = 1 - b.hp / TYPES[type].hp;
    r.line(q, { x: q.x - 4 * z, y: q.y + 6 * z }, '#655039', 1.3);
    r.line({ x: q.x - 4 * z, y: q.y + 6 * z }, { x: q.x + 2 * z, y: q.y + 12 * z }, '#6a543b', 1.1);
    if (f > 0.55) {
      r.line(
        { x: q.x + 2 * z, y: q.y + 12 * z },
        { x: q.x - 2 * z, y: q.y + 20 * z },
        '#5e4934',
        1.5,
      );
      for (let i = 0; i < 3; i++)
        r.prism(
          x + n * 0.5 + i * 0.2,
          y + n - 0.05,
          0.14,
          0.12,
          3,
          '#c3b28c',
          '#a58d66',
          '#7c6b4e',
        );
    }
  }
}
