import assert from 'node:assert/strict';
import test from 'node:test';
import { DrawingSurface } from '../src/client/render/drawing.js';

void test('canvas backing size follows DPR-only changes and fractional CSS dimensions', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  let ratio = 2;
  const dimensions = { width: 320.25, height: 180.5 },
    transforms: number[][] = [];
  const context = {
    setTransform: (...matrix: number[]) => {
      transforms.push(matrix);
    },
  };
  const canvas = {
    width: 300,
    height: 150,
    getContext: () => context,
    getBoundingClientRect: () => dimensions,
  } as unknown as HTMLCanvasElement;
  Object.defineProperty(globalThis, 'devicePixelRatio', { configurable: true, get: () => ratio });
  try {
    const surface = new DrawingSurface(canvas);
    surface.resize();
    assert.equal(canvas.width, 641);
    assert.equal(canvas.height, 361);
    assert.deepEqual(transforms.at(-1), [
      641 / dimensions.width,
      0,
      0,
      361 / dimensions.height,
      0,
      0,
    ]);
    ratio = 1.25;
    surface.resize();
    assert.equal(canvas.width, 400);
    assert.equal(canvas.height, 226);
    assert.deepEqual(transforms.at(-1), [
      400 / dimensions.width,
      0,
      0,
      226 / dimensions.height,
      0,
      0,
    ]);
    const count = transforms.length;
    surface.resize();
    assert.equal(transforms.length, count);
    dimensions.width = 320.3;
    surface.resize();
    assert.equal(transforms.length, count + 1);
    assert.deepEqual(transforms.at(-1), [400 / 320.3, 0, 0, 226 / dimensions.height, 0, 0]);
    const beforeHidden = transforms.length;
    dimensions.width = 0;
    dimensions.height = 0;
    surface.resize();
    assert.equal(transforms.length, beforeHidden);
    assert.equal(canvas.width, 400);
    assert.equal(canvas.height, 226);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'devicePixelRatio', previous);
    else Reflect.deleteProperty(globalThis, 'devicePixelRatio');
  }
});
