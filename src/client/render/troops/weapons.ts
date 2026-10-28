import type { Unit } from '../../../game/index.js';
import type { Sprite } from './sprite.js';
import { arabian, skin } from './style.js';
function shield(g: Sprite, x: number, y: number, col: string, round: boolean): void {
  if (round) {
    g.oval(x, y, 4.6, 5.2, col, '#382e27');
    g.oval(x - 0.5, y - 0.3, 3.5, 4.1, col, '#e3be74');
    g.oval(x, y, 1.1, 1.3, '#c7bda4');
  } else {
    g.shape(
      [
        [x - 4, y - 5],
        [x + 4, y - 5],
        [x + 3.3, y + 2],
        [x, y + 6],
        [x - 3.3, y + 2],
      ],
      col,
    );
    g.line(x - 2.8, y - 3.8, x + 2.8, y - 3.8, '#e8c57d', 1);
    g.line(x, y - 3.5, x, y + 3.5, '#e5d7a8', 1.1);
  }
}
export function weapon(g: Sprite, u: Unit, strike: number, col: string, time: number): void {
  const type = u.type,
    handX = 6 + strike * 3,
    handY = -14 - strike * 3;
  if (['archer', 'arabianarcher', 'horse_archer'].includes(type)) {
    const c = g.c,
      x = handX + 3,
      y = -16;
    c.beginPath();
    c.moveTo(x, -25);
    c.quadraticCurveTo(x + 7 + strike * 2, y, x, -7);
    c.strokeStyle = '#322e26';
    c.lineWidth = 2.8;
    c.stroke();
    c.strokeStyle = '#c49a57';
    c.lineWidth = 1.4;
    c.stroke();
    g.line(x, -25, x - strike * 3, y, '#e7d9b1', 0.7);
    g.line(x - strike * 3, y, x, -7, '#e7d9b1', 0.7);
    g.line(x - 5, y, x + 10, y - 1, '#ddd3ad', 0.9);
    g.shape(
      [
        [x + 11, y - 1],
        [x + 8, y - 2.5],
        [x + 8, y + 0.5],
      ],
      '#d7ded0',
      '',
      0,
    );
    g.limb(-4, -18, 0, -16, x - strike * 3, y, skin(u.id), 2);
    if (g.detail) {
      g.shape(
        [
          [-7, -22],
          [-4, -22],
          [-4, -10],
          [-7, -11],
        ],
        '#775239',
      );
      for (let i = 0; i < 3; i++) g.line(-7 + i, -22, -9 + i, -27, '#dfd1a0', 0.7);
    }
  } else if (type === 'crossbowman') {
    g.line(1, -13, 15 + strike * 2, -19, '#302e27', 4);
    g.line(1, -13, 15 + strike * 2, -19, '#a07c48', 2.3);
    g.line(7, -24, 13, -12, '#a3b4b4', 2);
    g.line(7, -24, 6, -17, '#e7d8a7', 0.7);
    g.line(13, -12, 6, -17, '#e7d8a7', 0.7);
    g.line(8, -17, 19, -22, '#e1e1cc', 1);
    g.limb(-4, -18, 0, -13, 7, -15, skin(u.id), 2.3);
  } else if (type === 'slinger') {
    const angle = time * 10 + u.id,
      spin = u.targetId !== null ? 1 : 0.2;
    g.limb(5, -18, 8, -22, 10, -26, skin(u.id), 2);
    g.line(
      10,
      -26,
      10 + Math.cos(angle) * 8 * spin,
      -28 + Math.sin(angle) * 4 * spin,
      '#baa47b',
      0.8,
    );
    g.oval(10 + Math.cos(angle) * 8 * spin, -28 + Math.sin(angle) * 4 * spin, 1.5, 1.2, '#8c816a');
    g.oval(-5, -9, 3.5, 4, '#9e7749', '#56442e');
  } else if (type === 'firethrower') {
    g.oval(handX + 1, handY + 3, 3.6, 5, '#b17d45', '#4c372b');
    g.line(handX - 1, handY - 1, handX + 3, handY - 1, '#e0b97a', 1.2);
    g.shape(
      [
        [handX, handY - 3],
        [handX - 1, handY - 6],
        [handX + 2, handY - 10],
        [handX + 3, handY - 6],
        [handX + 5, handY - 4],
      ],
      '#e69a39',
      '',
      0,
    );
    g.oval(handX + 2, handY - 5, 1.3, 2, '#ffe6a0');
  } else if (type === 'spearman' || type === 'pikeman') {
    const top = type === 'pikeman' ? -43 : -36,
      thrust = strike * 11;
    g.line(handX - 1, -4, handX + 5 + thrust, top, '#342d25', 2.8);
    g.line(handX - 1, -4, handX + 5 + thrust, top, '#b29258', 1.4);
    g.shape(
      [
        [handX + 5 + thrust, top - 7],
        [handX + 7 + thrust, top],
        [handX + 4 + thrust, top + 1],
      ],
      '#cbd3c7',
    );
    g.line(handX + 4 + thrust, top + 2, handX + 7 + thrust, top + 1, col, 2);
    shield(g, -7, -14, col, type === 'spearman');
  } else if (type === 'maceman' || type === 'brute') {
    g.line(handX, handY, handX + 4 + strike * 4, -28 + strike * 12, '#362d25', 3.7);
    g.line(handX, handY, handX + 4 + strike * 4, -28 + strike * 12, '#a0814c', 2);
    g.oval(
      handX + 4 + strike * 4,
      -29 + strike * 12,
      type === 'brute' ? 4.5 : 3.1,
      4,
      '#9ca8a3',
      '#353c3c',
    );
    if (g.detail)
      for (const dy of [-2, 1])
        g.line(
          handX + 2 + strike * 4,
          -29 + strike * 12 + dy,
          handX + 6 + strike * 4,
          -29 + strike * 12 + dy,
          '#dce0cd',
          0.8,
        );
    shield(g, -7, -13, col, true);
  } else if (type === 'assassin') {
    g.line(handX, handY, handX + 6, -23 + strike * 8, '#dce0d3', 2);
    g.line(-5, -14, -10, -19 - strike * 4, '#aabbb6', 1.7);
    g.line(handX - 2, handY - 1, handX + 2, handY + 1, '#be9754', 1.3);
  } else {
    const curved = type === 'arabianswordsman' || type === 'slave';
    const x = handX + 2 + strike * 9,
      y = -28 + strike * 11;
    g.line(handX, handY, x, y, '#303438', 3.5);
    if (curved) {
      const c = g.c;
      c.beginPath();
      c.moveTo(handX, handY);
      c.quadraticCurveTo(x + 6, y + 7, x + 4, y - 2);
      c.strokeStyle = '#d4ddce';
      c.lineWidth = 2.3;
      c.stroke();
    } else {
      g.shape(
        [
          [handX - 1, handY],
          [x - 1, y - 4],
          [x + 1.5, y],
          [handX + 1, handY],
        ],
        '#c5d2cd',
      );
      g.line(handX, handY, x, y - 3, '#f2ecd5', 0.8);
    }
    g.line(handX - 3, handY - 1, handX + 3, handY + 1, '#d3b168', 1.6);
    if (type !== 'slave') shield(g, -7, -14, col, arabian(type) || type === 'raider');
  }
}
