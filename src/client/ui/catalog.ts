import { catalogPreview } from '../render/catalog-preview.js';
import type {
  BuildingDefinition,
  BuildingType,
  TroopDefinition,
  TroopType,
} from '../../game/index.js';
import * as sim from '../../game/index.js';
import { TROOPS, TYPES } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import { element as $, buttonTarget, costText, entries, esc, fmt, names } from './dom.js';
type CatalogEntry =
  | { type: BuildingType; d: BuildingDefinition; troop: false }
  | { type: TroopType; d: TroopDefinition; troop: true };
function catalog(): CatalogEntry[] {
  return [
    ...(Object.keys(TYPES) as BuildingType[])
      .filter((type) => type !== 'keep')
      .map((type) => ({ type, d: TYPES[type], troop: false as const })),
    ...(Object.keys(TROOPS) as TroopType[])
      .filter((type) => !TROOPS[type].untrainable)
      .map((type) => ({ type, d: TROOPS[type], troop: true as const })),
  ];
}
export function requirement(
  app: ClientContext,
  d: BuildingDefinition | TroopDefinition,
  troop: boolean,
  type: BuildingType | TroopType,
): string {
  if (troop && sim.canRecruit) {
    const facility = app.state.buildings.find(
      (b) =>
        b.id === app.selectedBuilding &&
        app.owned(b) &&
        b.type === TROOPS[type as TroopType].facility,
    );
    const result = sim.canRecruit(app.state, type as TroopType, app.team, facility?.id);
    return result.ok ? '' : (result.reason ?? 'Recruitment unavailable');
  }
  const need = entries(d.cost || {})
    .filter(([k, v]) => (app.resources()[k] || 0) < (v ?? 0))
    .map(([k, v]) => `${Math.ceil((v ?? 0) - (app.resources()[k] || 0))} ${fmt(k)}`);
  return need.length ? `Need ${need.join(', ')}` : '';
}
export function badge(type: string, troop: boolean): string {
  const preview = catalogPreview(type, troop);
  if (!preview) return '';
  return `<span class="catalog-icon ${troop ? 'troop' : ''}" aria-hidden="true"><img src="${preview}" alt="" width="72" height="64" /></span>`;
}
export function renderLedger(app: ClientContext) {
  const all = catalog(),
    cats = [...new Set(all.map((v) => v.d.category || (v.troop ? 'army' : 'settlement')))];
  if (!cats.includes(app.tab)) app.tab = cats[0];
  $('tabs').innerHTML = cats
    .map(
      (c) =>
        `<button role="tab" aria-selected="${c === app.tab}" data-tab="${esc(c)}" class="${c === app.tab ? 'active' : ''}">${esc(names[c] || fmt(c))}</button>`,
    )
    .join('');
  $('build-list').innerHTML = all
    .filter((v) => (v.d.category || (v.troop ? 'army' : 'settlement')) === app.tab)
    .map(
      ({ type, d, troop }) =>
        `<button class="build-card ${app.buildType === type ? 'selected' : ''}" data-type="${type}" data-troop="${troop}" title="${esc(`${d.description || ''} ${('facility' in d ? d.facility : undefined) ? `Requires ${'facility' in d ? TYPES[d.facility].name : ''}. ` : ''}${costText(d.cost)}`)}">${app.badge(type, troop)}<span><span class="build-title">${esc(d.name)}<small>${troop ? 'RECRUIT' : `${'size' in d ? d.size : 0}×${'size' in d ? d.size : 0}`}</small></span><span class="cost">${esc(costText(d.cost))}</span><span class="build-description">${esc(d.description || `${d.hp} health · ${d.damage} attack`)}</span><span class="requirement"></span></span></button>`,
    )
    .join('');
  $('ledger-note').textContent = all.some((v) => v.troop && (v.d.category || 'army') === app.tab)
    ? 'Select troops, then right-click to move or attack. A + click: attack move.'
    : 'Choose a construction, then click valid ground. Drag walls to build a line. Esc cancels.';
  app.refreshAffordability();
}
export function refreshAffordability(app: ClientContext) {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.build-card')) {
    const d =
        b.dataset.troop === 'true'
          ? TROOPS[b.dataset.type! as TroopType]
          : TYPES[b.dataset.type! as BuildingType],
      reason = app.requirement(
        d,
        b.dataset.troop === 'true',
        b.dataset.type! as BuildingType | TroopType,
      );
    b.disabled = !!reason || app.state.status !== 'playing';
    b.classList.toggle('unaffordable', !!reason);
    b.querySelector<HTMLElement>('.requirement')!.textContent = reason;
    b.title = `${d.description || d.name}. ${reason || costText(d.cost)}${('facility' in d ? d.facility : undefined) ? `. Requires ${'facility' in d ? TYPES[d.facility].name : ''}` : ''}`;
  }
}
export function bindCatalog(app: ClientContext): void {
  $('tabs').onclick = (e) => {
    const b = buttonTarget(e);
    if (!b) return;
    app.rallyBuilding = null;
    app.tab = b.dataset.tab ?? 'Town';
    app.buildType = null;
    app.renderer.buildType = null;
    app.renderLedger();
  };
  $('build-list').onclick = async (e) => {
    const b = buttonTarget(e);
    if (!b) return;
    const type = b.dataset.type!;
    if (b.dataset.troop === 'true') {
      const facility = app.state.buildings.find(
        (v) =>
          v.id === app.selectedBuilding &&
          app.owned(v) &&
          v.type === TROOPS[type as TroopType].facility,
      );
      const result = await app.act({
        type: 'recruit',
        unit: type as TroopType,
        ...(facility ? { facilityId: facility.id } : {}),
      });
      if (result.ok) {
        app.toast(`${TROOPS[type as TroopType].name} recruited.`);
        if (result.unit) {
          app.clearSelection();
          if (app.online) app.pendingSelected.set(result.unit.id, performance.now() + 5000);
          else app.selected.add(result.unit.id);
        }
      }
    } else {
      app.rallyBuilding = null;
      app.buildType = app.buildType === type ? null : (type as BuildingType);
      app.renderer.buildType = app.buildType;
      app.selectedBuilding = null;
      app.renderLedger();
      app.updateHover();
    }
  };
}
