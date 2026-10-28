import type { Point } from '../../../game/index.js';
import type { DrawingSurface } from '../drawing.js';
import { Sprite } from './sprite.js';
export function horseSprite(g: Sprite, col: string, phase: number, armoredHorse = false): void {
  const moving = phase !== 0,
    step = moving ? Math.sin(phase) * 3 : 0;
  for (const [hip, offset] of [
    [-8, 0],
    [7, Math.PI],
  ] as const) {
    const v = moving ? Math.sin(phase + offset) * 3 : 1;
    g.limb(hip, -9, hip + v, -3, hip - v * 0.7, 4, '#584537', 2.7);
    g.line(hip - v * 0.7 - 1, 4, hip - v * 0.7 + 2, 4, '#282b29', 2.2);
  }
  g.shape(
    [
      [-11, -15],
      [-3, -20],
      [8, -19],
      [12, -12],
      [6, -6],
      [-8, -7],
    ],
    '#99714a',
  );
  g.oval(-7, -13, 6.5, 6, '#99714a');
  g.oval(5, -13, 8, 6, '#a37b51');
  g.shape(
    [
      [6, -15],
      [9, -26],
      [13, -28],
      [17, -19],
      [13, -11],
    ],
    '#ae8457',
  );
  g.oval(15, -26, 5.4, 3.8, '#b78d60', '#4e3e2f');
  g.shape(
    [
      [17, -27],
      [23, -25],
      [23, -22],
      [17, -21],
    ],
    '#a77c51',
  );
  g.shape(
    [
      [11, -28],
      [10, -33],
      [13, -30],
    ],
    '#785637',
  );
  g.shape(
    [
      [15, -29],
      [16, -33],
      [18, -28],
    ],
    '#9c744b',
  );
  g.line(8, -24, 11, -29, '#443c31', 3);
  g.line(7, -20, 9, -24, '#473c30', 3);
  g.line(-12, -14, -17, -7 + step * 0.4, '#493c30', 3.7);
  g.line(-17, -7 + step * 0.4, -18, -3 + step * 0.4, '#493c30', 2);
  g.shape(
    [
      [-8, -19],
      [5, -20],
      [8, -10],
      [-7, -9],
    ],
    col,
  );
  g.line(-6, -17, 4, -18, '#e3c17a', 1.1);
  g.shape(
    [
      [-5, -20],
      [3, -21],
      [5, -17],
      [-4, -15],
    ],
    '#5d4934',
  );
  g.line(3, -16, 2, -6, '#4c3c2c', 1.1);
  if (armoredHorse) {
    g.shape(
      [
        [6, -19],
        [10, -23],
        [15, -21],
        [12, -12],
        [7, -10],
      ],
      '#a7b7b0',
    );
    g.line(10, -21, 11, -13, '#d4d9c6', 1);
    g.shape(
      [
        [-11, -16],
        [-7, -18],
        [-5, -10],
        [-9, -8],
      ],
      '#8faaa5',
    );
  }
  for (const [hip, offset] of [
    [-9, Math.PI],
    [7, 0],
  ] as const) {
    const v = moving ? Math.sin(phase + offset) * 3 : -0.7;
    g.limb(hip, -9, hip + v, -3, hip - v, 4, '#a17b52', 3);
    g.line(hip - v - 1, 4, hip - v + 2, 4, '#2d302b', 2.2);
  }
  if (g.detail) {
    g.line(17, -26, 18, -22, '#4e4232', 1);
    g.line(18, -24, 8, -17, '#51432f', 0.8);
    g.oval(15, -26, 0.65, 0.65, '#282c29');
    g.line(-5, -13, 1, -13, '#e1c684', 0.8);
  }
}
export function horse(r: DrawingSurface, p: Point, col: string, walk: number): void {
  const c = r.ctx,
    z = r.camera.zoom;
  r.ellipse(p.x + 4 * z, p.y + 3 * z, 17, 5, '#403a3050');
  c.save();
  c.translate(p.x, p.y);
  c.scale(z, z);
  horseSprite(new Sprite(c, z > 0.7), col, walk);
  c.restore();
}
