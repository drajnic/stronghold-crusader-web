import type { Building, GameState } from '../../../game/index.js';
import { teamColor, type DrawingSurface } from '../drawing.js';
import { Sprite } from './sprite.js';
import { skin } from './style.js';
import { visualTime } from '../clock.js';
export function villager(
  r: DrawingSurface,
  x: number,
  y: number,
  b: Building,
  s: GameState,
  i: number,
): void {
  const p = r.project(x, y),
    z = r.camera.zoom;
  if (p.x < -30 || p.x > r.width + 30 || p.y < -30 || p.y > r.height + 30) return;
  const c = r.ctx,
    phase = visualTime(s) * 8 + b.id + i * 2,
    stride = Math.sin(phase),
    col = teamColor(b.team),
    id = b.id + i;
  r.ellipse(p.x + 3 * z, p.y + z, 5, 2.3, '#4a3d2f38');
  c.save();
  c.translate(p.x, p.y);
  c.scale(z * (i % 2 ? -1 : 1), z);
  const g = new Sprite(c, z > 0.72);
  g.limb(-1.7, -6, -2.2, -3, -2 + stride * 1.8, 0, '#6a614d', 1.8);
  g.limb(1.7, -6, 2.2, -3, 2 - stride * 1.8, 0, '#6a614d', 1.8);
  g.shape(
    [
      [-3.3, -14],
      [3, -14],
      [4, -5],
      [-3.5, -5],
    ],
    i % 2 ? '#c4af83' : '#d9c8a2',
  );
  g.line(-3, -6, 3.5, -6, col, 1.5);
  g.oval(0, -17, 2.8, 3.1, skin(id), '#5b4632');
  const mining = ['quarry', 'ironmine', 'pitchrig'].includes(b.type),
    wood = b.type === 'lumber',
    arms = ['blacksmith', 'armorer', 'fletcher', 'poleturner', 'tanner'].includes(b.type),
    ale = ['inn', 'brewery', 'hopsfarm'].includes(b.type);
  if (wood || mining) {
    g.oval(0, -19, 4, 1.4, '#c1a05f', '#6d573a');
    g.oval(0, -20, 2.5, 1.8, '#be9f66');
  } else {
    g.line(-3, -19, 3, -19, '#dfd4b6', 1.8);
    g.shape(
      [
        [-2, -20],
        [2, -20],
        [3, -17],
        [-3, -17],
      ],
      '#cfc2a1',
    );
  }
  g.limb(3, -12, 5, -9, 8, -10, skin(id), 1.8);
  g.limb(-3, -12, -4, -8, 2, -8, skin(id), 1.8);
  if (z > 0.56) {
    if (wood) {
      g.line(3, -10, 10, -12, '#4e3a29', 4);
      g.line(3, -11, 10, -13, '#b99457', 1.8);
      g.oval(10, -12, 1.8, 2, '#d1b37b', '#725230');
      g.line(-5, -8, -6, -20, '#887044', 1.3);
      g.shape(
        [
          [-6, -20],
          [-10, -20],
          [-9, -16],
          [-6, -17],
        ],
        '#a9b6a6',
      );
    } else if (mining) {
      g.shape(
        [
          [2, -11],
          [9, -12],
          [11, -6],
          [3, -5],
        ],
        '#8d8066',
      );
      g.shape(
        [
          [4, -12],
          [7, -14],
          [10, -12],
          [8, -9],
        ],
        b.type === 'ironmine' ? '#718781' : '#a99f85',
      );
      g.line(-5, -8, -8, -22, '#8b6e42', 1.4);
      g.line(-12, -21, -4, -23, '#b3b9a8', 2);
    } else if (ale) {
      g.oval(6, -9, 3.5, 4.2, '#a58248', '#493d2c');
      g.line(3, -10, 9, -10, '#6b6b53', 1);
      g.line(3, -7, 9, -7, '#6b6b53', 1);
    } else if (arms) {
      g.shape(
        [
          [3, -12],
          [9, -12],
          [9, -6],
          [3, -6],
        ],
        '#776f55',
      );
      g.line(-5, -10, -7, -18, '#7d613b', 1.2);
      g.line(-10, -18, -5, -19, '#b0b7a7', 2.5);
    } else {
      g.oval(6, -9, 4, 3.6, '#ad8a50', '#655034');
      g.line(3, -10, 9, -10, '#d5b97b', 0.7);
      if (g.detail) for (let n = 0; n < 3; n++) g.line(5 + n, -12, 4 + n, -16, '#d4ba64', 0.8);
    }
  }
  c.restore();
}
