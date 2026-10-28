import type { GameState, TroopType, Unit } from '../../../game/index.js';
import { TROOPS } from '../../../game/index.js';
import { teamColor } from '../drawing.js';
import type { Sprite } from './sprite.js';
import { motion } from './motion.js';
import { arabian, armored, skin } from './style.js';
import { weapon } from './weapons.js';
import { visualTime } from '../clock.js';
function head(g: Sprite, type: TroopType, col: string, id: number): void {
  const arab = arabian(type),
    heavy = armored(type),
    face = skin(id);
  if (type === 'assassin') {
    g.shape(
      [
        [-4, -24],
        [-3, -29],
        [0, -31],
        [4, -27],
        [4, -22],
        [1, -20],
        [-3, -21],
      ],
      '#363b3b',
    );
    g.oval(1, -25, 2.2, 2.3, face);
    g.line(-0.5, -24, 3, -24, '#2b2928', 1.5);
  } else if (arab) {
    g.oval(0, -25, 3.6, 4, face, '#44352d');
    g.shape(
      [
        [-4, -27],
        [-4, -29],
        [0, -30],
        [4, -28],
        [4, -25],
        [0, -26],
      ],
      type === 'slave' ? '#ddd0aa' : '#eee1bd',
    );
    g.line(-3, -28, 3, -27, '#b7a37e', 0.8);
    if (g.detail) g.line(-2, -26, 3, -25, '#d3c4a2', 0.8);
    if (type !== 'slave')
      g.shape(
        [
          [-3, -26],
          [-5, -21],
          [-2, -20],
          [0, -25],
        ],
        '#d1c2a0',
      );
    g.line(1, -24, 2.6, -24, '#3b302a', 0.8);
  } else if (type === 'archer' || type === 'raider') {
    g.oval(0, -25, 3.5, 3.9, face, '#43352d');
    g.shape(
      [
        [-4, -26],
        [-3, -29],
        [1, -30],
        [4, -27],
        [4, -25],
      ],
      type === 'archer' ? '#746340' : '#69523c',
    );
    g.line(-4, -26, 4, -25, '#baa578', 1.2);
    if (g.detail) g.line(2, -24, 3, -24, '#352e2a', 0.8);
  } else {
    g.oval(0, -25, 3.7, 4, heavy ? '#8c9ca1' : face, '#303639');
    g.shape(
      [
        [-4.2, -26],
        [-3.5, -29],
        [0, -30.5],
        [3.5, -28.5],
        [4.2, -25],
      ],
      heavy ? '#a8b7b6' : '#a4a99b',
    );
    g.line(-3, -28.6, 0, -30, '#e3e2cb', 1.1);
    g.line(-4.7, -25.3, 4.8, -25.3, '#4b5354', 1.4);
    if (heavy) {
      g.shape(
        [
          [-3, -25],
          [3.3, -25],
          [3, -21],
          [-2.3, -21],
        ],
        '#a3afb0',
      );
      g.line(-2.5, -24.3, 3, -24.3, '#303a3d', 1.1);
      g.line(0.7, -23.5, 0.7, -21.3, '#dde0ce', 0.8);
    } else g.line(1, -25, 1, -22, '#697577', 1.1);
    if (type === 'knight' || type === 'swordsman')
      g.shape(
        [
          [-1, -30],
          [0, -34],
          [3, -32],
          [2, -28],
        ],
        col,
      );
  }
}
export function soldier(g: Sprite, u: Unit, s: GameState, mounted: boolean): void {
  const col = teamColor(u.team),
    pose = motion(u, s),
    heavy = armored(u.type),
    arab = arabian(u.type),
    bare = u.type === 'slave';
  const width = u.type === 'brute' ? 7 : heavy ? 6 : 5.4;
  const leg = heavy ? '#808f91' : '#766c53';
  if (!mounted) {
    g.limb(-2.7, -9, -3.5 - pose.stride * 1.3, -4, -3.7 + pose.stride * 3, 0, leg, 3);
    g.limb(2.7, -9, 3.5 + pose.stride * 1.3, -4, 3.7 - pose.stride * 3, 0, leg, 3);
    g.line(-5 + pose.stride * 3, 0.1, -2 + pose.stride * 3, 0.1, '#342f28', 2.2);
    g.line(2 - pose.stride * 3, 0.1, 5 - pose.stride * 3, 0.1, '#342f28', 2.2);
  } else {
    g.limb(-4, -10, -6, -4, -3, 0, '#707e7b', 3);
    g.line(-3, 0, 0, -1, '#342e28', 2);
  }
  const lift = mounted ? 0 : Math.abs(pose.stride) * 0.65 + pose.breath;
  g.c.save();
  g.c.translate(0, -lift);
  if (arab && !bare)
    g.shape(
      [
        [-width, -20],
        [width, -20],
        [width + 1, -6],
        [2, -5],
        [0, -9],
        [-2, -5],
        [-width - 1, -6],
      ],
      u.type === 'assassin' ? '#424743' : '#d9cba9',
    );
  else
    g.shape(
      [
        [-width, -21],
        [width, -21],
        [width + 1, -10],
        [width - 1, -7],
        [-width + 1, -7],
        [-width - 1, -10],
      ],
      bare ? skin(u.id) : heavy ? '#899a9b' : '#82654a',
    );
  if (!bare) {
    g.shape(
      [
        [-3.8, -21],
        [3.8, -21],
        [4.4, -9],
        [-4.4, -9],
      ],
      col,
    );
    g.line(-3.4, -20, -2.7, -10, '#c4d5bc', 0.8);
    g.line(-width, -9, width, -9, '#473a2a', 2);
    g.oval(1, -9, 0.9, 1, '#e2bf72');
  } else g.line(-5, -8, 5, -8, col, 2.2);
  if (heavy) {
    g.oval(-width, -19, 2.6, 2.2, '#b6c0b8', '#394445');
    g.oval(width, -19, 2.6, 2.2, '#a7b6b2', '#394445');
    if (g.detail) {
      g.line(-4, -14, 4, -14, '#ccd1bd', 0.8);
      g.line(-4, -12, 4, -12, '#5c7375', 0.7);
      for (let x = -4; x <= 4; x += 2) g.oval(x, -16, 0.45, 0.45, '#d3d3bb');
    }
  } else if (g.detail && !bare) {
    g.line(-2, -18, -2, -12, '#d3c5a1', 0.6);
    g.line(2, -18, 2, -12, '#3f665f', 0.6);
  }
  g.limb(
    width,
    -18,
    7 + pose.strike * 2,
    -14,
    6 + pose.strike * 3,
    -14 - pose.strike * 3,
    heavy ? '#acb9b3' : skin(u.id),
    2.4,
  );
  if (TROOPS[u.type].range < 4 && !['slinger', 'firethrower'].includes(u.type))
    g.limb(-width, -18, -7, -14, -7, -12, heavy ? '#a6b4af' : skin(u.id), 2.3);
  head(g, u.type, col, u.id);
  weapon(g, u, pose.strike, col, visualTime(s));
  g.c.restore();
}
