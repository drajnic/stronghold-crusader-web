import { clampZoom, shouldIgnoreShortcut } from './interaction.js';
import { hitRenderedUnit } from '../render/unit-picking.js';
import type { Point, Unit } from '../../game/index.js';
import { TYPES, canPlace, hostile } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import { element as $ } from './dom.js';
export function pos(app: ClientContext, e: MouseEvent | PointerEvent | WheelEvent): Point {
  const r = app.renderer.canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
export function zoom(app: ClientContext, delta: number, point?: Point) {
  const old = point && app.renderer.inverse(point.x, point.y);
  app.renderer.camera.zoom = clampZoom(app.renderer.camera.zoom + delta);
  if (old) {
    const n = app.renderer.inverse(point.x, point.y);
    app.renderer.camera.x += old.x - n.x;
    app.renderer.camera.y += old.y - n.y;
  }
  $('zoom-label').textContent = Math.round(app.renderer.camera.zoom * 100) + '%';
}
export function updateHover(app: ClientContext) {
  const hint = $('placement-hint');
  hint.hidden = !app.buildType || !app.renderer.hover;
  if (!app.buildType || !app.renderer.hover) return;
  const { x, y } = app.renderer.hover,
    v = canPlace(app.state, app.buildType, Math.floor(x), Math.floor(y), app.team);
  app.renderer.valid = v.ok;
  hint.textContent = v.ok
    ? `${TYPES[app.buildType].name} · Click to construct`
    : (v.reason ?? 'This building cannot be placed here.');
  hint.classList.toggle('invalid', !v.ok);
}
export function hitUnit(app: ClientContext, point: Point, friendlyOnly = false): Unit | undefined {
  return hitRenderedUnit(
    app.state,
    app.renderer,
    point,
    (unit) => !friendlyOnly || app.owned(unit),
  );
}
export async function issue(app: ClientContext, point: Point, world: Point) {
  const b = app.renderer.hitTestBuilding(app.state, point.x, point.y),
    u = app.hitUnit(point);
  if (
    b &&
    app.owned(b) &&
    TYPES[b.type].garrison &&
    (app.orderMode === 'garrison' || !app.orderMode)
  ) {
    await app.act({ type: 'garrison', ids: [...app.selected], buildingId: b.id });
  } else {
    const target =
      u && hostile(app.state, app.team, u.team)
        ? u
        : b && hostile(app.state, app.team, b.team)
          ? b
          : null;
    await app.act({
      type: 'command',
      ids: [...app.selected],
      x: world.x,
      y: world.y,
      ...(target ? { targetId: target.id } : {}),
      ...(app.orderMode === 'attack' ? { attackMove: true } : {}),
    });
  }
  app.orderMode = null;
}
export function bindInput(app: ClientContext): void {
  $('zoom-in').onclick = () => app.zoom(0.1);
  $('zoom-out').onclick = () => app.zoom(-0.1);
  $('home').onclick = app.center;
  app.renderer.canvas.oncontextmenu = (e) => e.preventDefault();
  app.renderer.canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      app.zoom(e.deltaY < 0 ? 0.08 : -0.08, app.pos(e));
      app.renderer.hover = app.renderer.inverse(app.mouse.x, app.mouse.y);
      app.updateHover();
    },
    { passive: false },
  );
  app.renderer.canvas.onpointerdown = (e) => {
    if (!app.started || app.modal) return;
    app.pendingSelected.clear();
    app.renderer.canvas.focus();
    app.mouse = app.pos(e);
    app.pointer = {
      button: e.button,
      start: app.mouse,
      last: app.mouse,
      shift: e.shiftKey,
      world: app.renderer.inverse(app.mouse.x, app.mouse.y),
    };
    app.renderer.canvas.setPointerCapture(e.pointerId);
  };
  app.renderer.canvas.onpointermove = (e) => {
    app.mouse = app.pos(e);
    app.renderer.hover = app.renderer.inverse(app.mouse.x, app.mouse.y);
    app.updateHover();
    if (!app.pointer) return;
    const dx = app.mouse.x - app.pointer.last.x,
      dy = app.mouse.y - app.pointer.last.y;
    if (app.pointer.button === 1) {
      const a = app.renderer.inverse(0, 0),
        b = app.renderer.inverse(dx, dy);
      app.renderer.camera.x -= b.x - a.x;
      app.renderer.camera.y -= b.y - a.y;
    } else if (
      app.pointer.button === 0 &&
      !app.buildType &&
      !app.orderMode &&
      !app.rallyBuilding &&
      Math.hypot(app.mouse.x - app.pointer.start.x, app.mouse.y - app.pointer.start.y) > 5
    )
      app.renderer.selection = { a: app.pointer.start, b: app.mouse };
    app.pointer.last = app.mouse;
  };
  app.renderer.canvas.onpointerleave = () => {
    if (!app.pointer) {
      app.renderer.hover = null;
      app.updateHover();
    }
  };
  app.renderer.canvas.onpointercancel = () => {
    app.pointer = null;
    app.renderer.selection = null;
  };
  app.renderer.canvas.onpointerup = async (e) => {
    if (!app.pointer) return;
    const p = app.pointer;
    app.pointer = null;
    app.renderer.selection = null;
    const point = app.pos(e),
      world = app.renderer.inverse(point.x, point.y),
      drag = Math.hypot(point.x - p.start.x, point.y - p.start.y) > 6;
    if (!app.started || app.modal) return;
    if (p.button === 2) {
      if (app.rallyBuilding) {
        app.rallyBuilding = null;
        app.refresh();
        return;
      }
      if (app.buildType) {
        app.buildType = null;
        app.renderer.buildType = null;
        app.renderLedger();
        app.updateHover();
      } else if (app.selected.size) await app.issue(point, world);
    } else if (p.button === 0) {
      if (app.rallyBuilding) {
        const result = await app.act({ type: 'rally', id: app.rallyBuilding, point: world });
        if (result.ok) {
          app.rallyBuilding = null;
          app.toast('Rally point set.');
        }
      } else if (app.buildType) {
        const type = app.buildType;
        if (type === 'wall' && drag) {
          const dx = Math.floor(world.x) - Math.floor(p.world.x),
            dy = Math.floor(world.y) - Math.floor(p.world.y),
            steps = Math.min(app.state.map.width, Math.max(Math.abs(dx), Math.abs(dy)));
          let count = 0;
          for (let i = 0; i <= steps; i++) {
            const result = await app.act(
              {
                type: 'place',
                building: type,
                x: Math.floor(p.world.x) + Math.round((dx * i) / (steps || 1)),
                y: Math.floor(p.world.y) + Math.round((dy * i) / (steps || 1)),
              },
              true,
            );
            if (result.ok) count++;
          }
          app.toast(`${count} wall sections constructed.`);
        } else {
          const result = await app.act({
            type: 'place',
            building: type,
            x: Math.floor(world.x),
            y: Math.floor(world.y),
          });
          if (result.ok) app.toast(`${TYPES[type].name} constructed.`);
        }
      } else if (app.orderMode && app.selected.size) await app.issue(point, world);
      else {
        if (!p.shift) app.selected.clear();
        app.selectedBuilding = null;
        if (drag) {
          for (const u of app.state.units) {
            if (!app.owned(u) || u.garrisonId) continue;
            const q = app.renderer.project(u.x, u.y, 9);
            if (
              q.x >= Math.min(p.start.x, point.x) &&
              q.x <= Math.max(p.start.x, point.x) &&
              q.y >= Math.min(p.start.y, point.y) &&
              q.y <= Math.max(p.start.y, point.y)
            )
              app.selected.add(u.id);
          }
        } else {
          const u = app.hitUnit(point, true);
          if (u) app.selected.add(u.id);
          else
            app.selectedBuilding =
              app.renderer.hitTestBuilding(app.state, point.x, point.y)?.id || null;
        }
      }
    }
    app.refresh();
  };
  $('minimap').onpointerdown = (e) => {
    const r = $('minimap').getBoundingClientRect();
    app.renderer.camera.x = Math.max(
      0,
      Math.min(app.state.map.width, ((e.clientX - r.left) / r.width) * app.state.map.width),
    );
    app.renderer.camera.y = Math.max(
      0,
      Math.min(app.state.map.height, ((e.clientY - r.top) / r.height) * app.state.map.height),
    );
  };
  window.onkeydown = (e) => {
    if (e.target instanceof Element && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))
      return;
    const key = e.key.toLowerCase();
    if (shouldIgnoreShortcut(e)) {
      app.keys.clear();
      return;
    }
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();
    app.keys.add(key);
    if (key === 'escape') {
      if (
        !app.modal &&
        (app.buildType || app.selected.size || app.orderMode || app.rallyBuilding)
      ) {
        app.clearSelection();
        app.renderLedger();
        app.refresh();
      } else if (app.modal && app.modal !== 'menu') app.closeModal();
      else if (app.modal === 'menu' && app.started) app.setModal(null);
      else void app.menu();
    }
    if (!app.started || app.modal) return;
    if (key === 'h') app.center();
    if (key === ' ' && !app.online) {
      app.paused = !app.paused;
      app.refresh();
    }
    if (key === 'a' && !e.ctrlKey && app.selected.size) {
      app.keys.delete('a');
      app.orderMode = 'attack';
      app.toast('Attack move: click a destination.');
    }
    if (key === 'g' && app.selected.size) {
      app.orderMode = 'garrison';
      app.toast('Garrison: click a friendly tower.');
    }
    if (/^[1-9]$/.test(key)) {
      app.rallyBuilding = null;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        app.groups.set(key, [...app.selected]);
        app.toast(`Group ${key} assigned.`);
      } else {
        app.selected.clear();
        for (const id of app.groups.get(key) || [])
          if (app.state.units.some((u) => u.id === id && app.owned(u))) app.selected.add(id);
        app.selectedBuilding = null;
        app.refresh();
      }
    }
  };
  window.onkeyup = (e) => {
    if (['Meta', 'Control', 'Alt'].includes(e.key)) app.keys.clear();
    else app.keys.delete(e.key.toLowerCase());
  };
  window.onblur = () => {
    app.keys.clear();
    app.pointer = null;
    app.renderer.selection = null;
  };
}
