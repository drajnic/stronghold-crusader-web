import type { GameState, Point, Unit } from '../../../game/index.js';
import { teamColor, type DrawingSurface } from '../drawing.js';
import { Sprite } from './sprite.js';
import { facing, motion } from './motion.js';
import { health } from './overlays.js';
function wheel(g: Sprite, x: number, y: number, phase: number): void {
  g.oval(x, y, 4.4, 5.1, '#554331', '#2f3030');
  g.oval(x, y, 3.1, 3.9, '#aa8450', '#b2afa0');
  if (g.detail)
    for (let n = 0; n < 4; n++) {
      const a = phase + (n * Math.PI) / 2;
      g.line(x, y, x + Math.cos(a) * 3, y + Math.sin(a) * 3.7, '#4c3c2c', 0.9);
    }
  g.oval(x, y, 1.1, 1.2, '#b9b7a1');
}
function timber(g: Sprite, ax: number, ay: number, bx: number, by: number, width = 4): void {
  g.line(ax, ay, bx, by, '#392e24', width + 1.3);
  g.line(ax, ay, bx, by, '#987244', width);
  g.line(ax - 0.5, ay - 1, bx - 0.5, by - 1, '#c5a76d', 0.8);
  if (g.detail) {
    g.line(ax + 0.8, ay + 1, bx + 0.8, by + 1, '#705230', 0.5);
    g.oval(ax, ay, 0.8, 0.8, '#d0c5a4');
    g.oval(bx, by, 0.8, 0.8, '#c1baa2');
  }
}
export function siegeUnit(r: DrawingSurface, u: Unit, s: GameState, p: Point): void {
  const c = r.ctx,
    z = r.camera.zoom,
    pose = motion(u, s),
    col = teamColor(u.team);
  c.save();
  c.translate(p.x, p.y);
  c.scale(z * facing(u, s), z);
  const g = new Sprite(c, z > 0.67);
  wheel(g, -12, -6, pose.walk * 0.5);
  wheel(g, 13, -5, pose.walk * 0.5);
  g.shape(
    [
      [-21, -5],
      [1, -13],
      [23, -3],
      [1, 7],
    ],
    '#9e7b48',
  );
  g.shape(
    [
      [-21, -5],
      [1, 7],
      [1, 12],
      [-21, 0],
    ],
    '#765532',
  );
  g.shape(
    [
      [1, 7],
      [23, -3],
      [23, 2],
      [1, 12],
    ],
    '#654b2e',
  );
  if (g.detail)
    for (let n = 0; n < 4; n++)
      g.line(-16 + n * 7, -6 + n * 0.9, -1 + n * 6, 3 - n * 2, '#c6a368', 0.7);
  timber(g, -15, 2, 15, -5, 3);
  timber(g, -10, -8, 14, 3, 3);
  if (u.type === 'ram') {
    for (const x of [-13, 11]) {
      timber(g, x, 0, x, -21, 3);
      g.line(x, -21, x, -10, '#c6c6ae', 1);
    }
    const swing = pose.strike * 5;
    timber(g, -20 + swing, -10, 23 + swing, -10, 6);
    g.oval(24 + swing, -10, 4.5, 4, '#9ca8a0', '#303a39');
    g.line(24 + swing, -13, 27 + swing, -10, '#d9d9be', 1.2);
    g.shape(
      [
        [-24, -23],
        [-5, -34],
        [24, -22],
        [6, -12],
      ],
      '#827b5b',
    );
    g.shape(
      [
        [-24, -23],
        [6, -12],
        [6, -8],
        [-24, -19],
      ],
      '#555642',
    );
    g.shape(
      [
        [-5, -34],
        [24, -22],
        [24, -18],
        [6, -8],
        [6, -12],
      ],
      '#696b50',
    );
    if (g.detail)
      for (let n = 0; n < 4; n++)
        g.line(-19 + n * 9, -23 + n * 2, -1 + n * 7, -15 + n * 0.6, '#b5a77a', 0.7);
  } else if (u.type === 'trebuchet') {
    timber(g, -15, 1, -3, -38, 4);
    timber(g, 14, 2, -3, -38, 4);
    timber(g, -11, -5, 1, -37, 3);
    timber(g, -11, -8, 10, -4, 2);
    const angle = -0.75 + pose.strike * 1.7,
      ax = -3,
      ay = -36,
      tip = { x: ax + Math.cos(angle) * 34, y: ay + Math.sin(angle) * 34 },
      counter = { x: ax - Math.cos(angle) * 14, y: ay - Math.sin(angle) * 14 };
    timber(g, counter.x, counter.y, tip.x, tip.y, 4);
    g.line(tip.x, tip.y, tip.x + 5, tip.y + 13, '#ddc990', 1);
    g.shape(
      [
        [tip.x + 2, tip.y + 13],
        [tip.x + 9, tip.y + 13],
        [tip.x + 6, tip.y + 17],
      ],
      '#6e5a3f',
    );
    g.shape(
      [
        [counter.x - 5, counter.y],
        [counter.x + 5, counter.y],
        [counter.x + 5, counter.y + 10],
        [counter.x - 5, counter.y + 10],
      ],
      '#7c7b62',
    );
    g.line(counter.x - 3, counter.y + 2, counter.x + 3, counter.y + 2, '#c3b68e', 1);
    g.oval(ax, ay, 2, 2, '#bec1a9');
  } else if (u.type === 'ballista') {
    timber(g, -9, 0, -4, -22, 4);
    timber(g, 12, 2, 5, -20, 4);
    timber(g, -6, -25, 12, -9, 4);
    g.line(-22, -25, 22, -11, '#333a37', 4);
    g.line(-22, -25, -2, -13, '#b8bca3', 2);
    g.line(-2, -13, 22, -11, '#bac0a9', 2);
    g.line(-22, -25, -5, -7, '#ded0a1', 0.8);
    g.line(22, -11, -5, -7, '#ded0a1', 0.8);
    g.line(-8, -29, 14, -7, '#e1d7b2', 2);
    g.shape(
      [
        [-10, -33],
        [-9, -25],
        [-5, -28],
      ],
      '#c7d5c8',
    );
  } else {
    timber(g, -13, 0, -3, -22, 4);
    timber(g, 12, 1, -3, -22, 4);
    g.line(-15, -8, 11, -10, '#d2bc83', 1);
    g.line(-13, -6, 10, -8, '#d2bc83', 1);
    const angle = -1.1 + pose.strike * 1.5,
      tx = -3 + Math.cos(angle) * 23,
      ty = -19 + Math.sin(angle) * 23;
    timber(g, -9, -7, tx, ty, 4);
    g.oval(tx, ty, 6, 3.2, '#68553a', '#d2b27a');
    g.oval(tx, ty - 1.4, 3.2, 2.8, '#7c7e6b');
    g.oval(-3, -19, 2, 2, '#b7b8a4');
  }
  wheel(g, -10, 8, pose.walk * 0.5);
  wheel(g, 15, 4, pose.walk * 0.5);
  g.shape(
    [
      [-15, -14],
      [-7, -12],
      [-7, -3],
      [-15, -5],
    ],
    col,
  );
  g.line(-14, -13, -8, -11, '#e1bf78', 1);
  c.restore();
  health(r, p, u, u.type === 'trebuchet' ? 72 : 48);
}
