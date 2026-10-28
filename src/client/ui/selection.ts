import type { Entity, ResourceKey, Stance } from '../../game/index.js';
import { TROOPS, TYPES, factionFor, fearFactor, resourcesFor } from '../../game/index.js';
import { WELL_RANGE, wellTargets } from '../../game/fire.js';
import { fireBlocker } from '../../game/line-of-fire.js';
import type { ClientContext, OrderMode } from '../context.js';
import { element as $, buttonTarget, costText, esc, patchContent } from './dom.js';
export function selectionInfo(app: ClientContext) {
  const info = $('selection-info'),
    units = app.state.units.filter((u) => app.selected.has(u.id) && app.owned(u));
  let html;
  if (app.buildType) {
    const d = TYPES[app.buildType];
    html = `<span class="eyebrow">PLACING A BUILDING</span><b>${esc(d.name)}</b><p>${esc(d.description)} · Click to place</p>`;
  } else if (units.length) {
    const entities = new Map<number, Entity>(
        [...app.state.units, ...app.state.buildings].map((e) => [e.id, e]),
      ),
      types = [...new Set(units.map((u) => TROOPS[u.type].name))],
      blocked = units.filter((u) => {
        if (u.targetId == null) return false;
        const target = entities.get(u.targetId);
        return target && target.hp > 0 && fireBlocker(app.state, u, target);
      }).length;
    html = `<span class="eyebrow">YOUR COMMAND · ${units.length} SELECTED</span><b>${esc(types.join(' · '))}</b>${blocked ? `<p>Line of fire blocked · ${blocked} selected. Reposition or use elevated troops / arcing siege.</p>` : ''}<div class="command-actions"><button data-order="move">Move</button><button data-order="attack">Attack move</button><button data-stance="hold">Hold</button><button data-stance="defensive">Defensive</button><button data-stance="aggressive">Aggressive</button><button data-order="garrison">Garrison</button></div>`;
  } else if (app.selectedBuilding) {
    const b = app.state.buildings.find((v) => v.id === app.selectedBuilding);
    if (!b) {
      app.selectedBuilding = null;
      return app.selectionInfo();
    }
    const d = TYPES[b.type],
      throughput = d.bonus ? 1 : fearFactor(app.state, b.team).productivity;
    html = `<span class="eyebrow">${esc(b.team === app.team ? 'YOUR BUILDING' : factionFor(app.state, b.team)?.name || 'RIVAL')} · ${Math.ceil(b.hp)} / ${d.hp} HP</span><b>${esc(d.name)}</b><p>${b.fire ? `<strong>ON FIRE · ${Math.ceil(b.fire.remaining)}s remaining · repair and recruitment unavailable</strong> · ` : ''}${b.type === 'well' ? `${b.paused ? 'Paused' : (b.active ?? 0) > 0 ? `Active · ${Math.round((b.active ?? 0) * 100)}% staffed` : 'No workers'} · radius ${WELL_RANGE} · ${wellTargets(app.state).has(b.id) ? 'Suppressing one fire' : 'No fire being suppressed'} · ` : ''}${app.rallyBuilding === b.id ? 'Click a rally destination · Esc cancels. ' : ''}${b.rallyPoint ? `Rally at ${b.rallyPoint.x.toFixed(1)}, ${b.rallyPoint.y.toFixed(1)}. ` : ''}${esc(d.description || 'The heart of the realm.')}${d.workers ? ` · ${d.workers} workers` : ''}${d.input ? ` · Inputs/s: ${costText(d.input)}` : ''}${d.rate ? ` · Outputs/s: ${costText(d.rate)}` : ''}${d.workers ? ` · ${b.fire ? 'Work stopped by fire' : b.paused ? `Paused · ${d.workers} workers released · no inputs or outputs` : `Staffed ${Math.round((b.active ?? 1) * 100)}%${b.type === 'well' ? '' : ` · output ${Math.round((b.active ?? 1) * throughput * 100)}%`}`} ${!b.paused && (Object.keys(d.input || {}) as ResourceKey[]).some((k) => !(resourcesFor(app.state, b.team)[k] > 0)) ? ' · Missing production input' : ''}` : ''}</p>${app.owned(b) ? `<div class="command-actions"><button data-building-action="repair" ${b.fire || b.hp >= d.hp || app.state.time - (b.lastHit ?? -99) < 6 ? 'disabled' : ''} title="${b.fire ? 'Cannot repair a burning building' : 'Repair for wood and stone after six seconds out of combat'}">Repair</button>${d.workers ? `<button data-building-action="workplace" title="Pausing releases workers and stops resource use and production">${b.paused ? 'Resume work' : 'Pause work'}</button>` : ''}${b.type !== 'keep' ? '<button data-building-action="demolish">Demolish</button>' : ''}${b.type === 'gate' ? `<button data-building-action="gate">${b.open ? 'Close' : 'Open'} gate</button>` : ''}${d.garrison ? `<button data-building-action="ungarrison" ${app.state.units.some((u) => u.garrisonId === b.id) ? '' : 'disabled'}>Ungarrison</button>` : ''}${['barracks', 'mercenary', 'siege'].includes(b.type) ? `<button data-rally="set">Set rally</button><button data-rally="clear" ${b.rallyPoint ? '' : 'disabled'}>Clear rally</button>` : ''}${b.type === 'market' ? '<button data-stockpile>Trade</button>' : ''}</div>` : ''}`;
  } else
    html =
      '<span class="eyebrow">YOUR REALM AWAITS</span><b>A foothold in the desert.</b><p>Select a building to inspect it, or troops to give orders.</p>';
  patchContent(info, html);
}
export function bindSelection(app: ClientContext): void {
  $('selection-info').onclick = (e) => {
    const b = buttonTarget(e);
    if (!b) return;
    if (b.dataset.rally && app.selectedBuilding) {
      if (b.dataset.rally === 'clear') {
        app.rallyBuilding = null;
        void app.act({ type: 'rally', id: app.selectedBuilding, point: null });
      } else {
        app.rallyBuilding = app.selectedBuilding;
        app.orderMode = null;
        app.toast('Click a rally destination. Escape cancels.');
        app.selectionInfo();
      }
    }
    if (b.dataset.stance)
      void app.act({ type: 'stance', ids: [...app.selected], stance: b.dataset.stance as Stance });
    if (b.dataset.order) {
      app.orderMode = b.dataset.order as OrderMode;
      app.toast(
        app.orderMode === 'garrison'
          ? 'Click a friendly tower with ranged troops selected.'
          : `Click a destination for ${app.orderMode === 'attack' ? 'attack move' : 'movement'}.`,
      );
    }
    if (b.hasAttribute('data-stockpile')) {
      app.returnModal = null;
      app.setModal('stockpile');
    }
    if (b.dataset.buildingAction) {
      const building = app.state.buildings.find((v) => v.id === app.selectedBuilding),
        type = b.dataset.buildingAction as
          'repair' | 'demolish' | 'gate' | 'ungarrison' | 'workplace';
      if (!building) return;
      void app.act(
        type === 'workplace'
          ? { type, id: building.id, paused: !building.paused }
          : type === 'ungarrison'
            ? { type, buildingId: building.id }
            : type === 'gate'
              ? { type, id: building.id, open: !building.open }
              : { type, id: building.id },
      );
    }
  };
}
