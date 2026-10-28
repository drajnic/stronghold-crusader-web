import * as sim from '../../game/index.js';
import {
  TYPES,
  capacity,
  hostile,
  fearFactor,
  income,
  popularityBreakdown,
  population,
  workforce,
} from '../../game/index.js';
import type { ClientContext } from '../context.js';
import { element as $, fmt, time } from './dom.js';
export function refresh(app: ClientContext) {
  if (
    app.rallyBuilding != null &&
    !app.state.buildings.some(
      (b) =>
        b.id === app.rallyBuilding &&
        b.hp > 0 &&
        app.owned(b) &&
        ['barracks', 'mercenary', 'siege'].includes(b.type),
    )
  ) {
    app.rallyBuilding = null;
    app.toast('Rally placement cancelled: the recruiting facility is no longer available.');
  }
  const mapTitle = document.getElementById('map-title');
  if (mapTitle) mapTitle.textContent = app.state.map.name;
  for (const [id, expires] of app.pendingSelected) {
    if (app.state.units.some((u) => u.id === id && app.owned(u))) {
      app.selected.add(id);
      app.pendingSelected.delete(id);
    } else if (performance.now() > expires) app.pendingSelected.delete(id);
  }
  const r = app.resources(),
    f = app.faction(),
    rates = income(app.state, app.viewTeam());
  $('resources').innerHTML = (['wood', 'stone', 'food', 'gold'] as const)
    .map(
      (k) =>
        `<div class="resource" title="${fmt(k)} · net ${Number(rates[k] || 0).toFixed(1)} per second"><span class="resource-icon ${k}">${{ wood: '▰', stone: '◆', food: '♧', gold: '◉' }[k]}</span><span><b>${Math.floor(r[k] || 0)}</b><small>${Number(rates[k] || 0) >= 0 ? '+' : ''}${Number(rates[k] || 0).toFixed(1)} /s</small></span><label>${k.toUpperCase()}</label></div>`,
    )
    .join('');
  $('population').textContent =
    `${population(app.state, app.team)} / ${capacity(app.state, app.team)}`;
  $('workers').textContent =
    `${Math.min(workforce(app.state, app.team), f.civilians)} / ${f.civilians} workers employed`;
  $('popularity').textContent = `${Math.round(f.popularity)}%`;
  const politics = popularityBreakdown(app.state, app.viewTeam())!,
    rule = fearFactor(app.state, app.viewTeam()),
    signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
  $('popularity-detail').textContent =
    `Target ${politics.target}% · rations ${signed(politics.rations)}, tax ${signed(politics.tax)}, faith ${signed(politics.faith)}, ale ${signed(politics.ale)}, rule ${signed(politics.fear)}${politics.hunger ? `, hunger ${politics.hunger}` : ''}. ${f.popularity >= 55 ? 'Residents may arrive.' : f.popularity < 35 ? 'Residents leave.' : 'Population steady.'}`;
  $('ruler-status').textContent =
    `${rule.score > 0 ? 'Kind' : rule.score < 0 ? 'Feared' : 'Balanced'} rule · ${signed(rule.score)} / ±5`;
  $('ruler-meter').value = rule.score;
  $('ruler-effects').textContent =
    `Productivity ${Math.round(rule.productivity * 100)}% · troop damage ${Math.round(rule.morale * 100)}%`;
  if (document.activeElement !== $('tax')) $('tax').value = String(f.tax);
  if (document.activeElement !== $('rations')) $('rations').value = String(f.rations);
  const keep = app.state.buildings.find((b) => app.owned(b) && b.type === 'keep'),
    hp = Math.round(((keep?.hp || 0) / TYPES.keep.hp) * 100);
  const fires = app.state.buildings.filter((b) => app.owned(b) && b.fire).length;
  $('keep-status').textContent =
    `Keep integrity · ${hp}%${fires ? ` · ${fires} building${fires === 1 ? '' : 's'} on fire` : ''}`;
  $('keep-health').style.width = hp + '%';
  $('clock').textContent = `${time(app.state.time)} · DAY ${Math.floor(app.state.time / 300) + 1}`;
  $('mode-label').textContent = app.online
    ? `${app.room?.multiplayerMode === 'versus' ? 'VERSUS' : 'CO-OP'} · ROOM ${app.room?.code}`
    : `${app.state.mode.toUpperCase()} · ${app.state.difficulty.toUpperCase()}`;
  const enemies = app.state.units.filter((u) => hostile(app.state, app.team, u.team)).length;
  $('wave-label').textContent =
    app.state.mode === 'sandbox'
      ? 'CASTLE BUILDER'
      : app.state.mode === 'survival'
        ? `RAID ${app.state.wave || 0} / 4`
        : 'THE RIVAL STANDARD';
  $('wave-countdown').textContent = enemies
    ? `${enemies} hostile soldiers in the valley`
    : app.state.mode === 'survival' ||
        (app.state.mode === 'campaign' && sim.SCENARIOS[app.state.scenario].kind === 'survival')
      ? `Next invasion in ${time(Math.max(0, app.state.nextWave - app.state.time))}`
      : 'The valley watches';
  $('invasion').hidden = app.state.mode !== 'sandbox';
  $('objective-title').textContent =
    app.state.mode === 'sandbox'
      ? 'A castle of your own.'
      : app.state.mode === 'survival'
        ? 'Hold the valley.'
        : app.state.mode === 'campaign'
          ? sim.SCENARIOS?.[app.state.scenario]?.name || 'The Amber Chronicles'
          : 'Conquer the crossroads.';
  $('objective-copy').textContent =
    app.state.mode === 'campaign'
      ? sim.SCENARIOS[app.state.scenario].description
      : app.state.mode === 'sandbox'
        ? 'Build your realm at your own pace. Call an invasion when your defenses are ready.'
        : app.state.mode === 'survival'
          ? 'Repel every raiding army. Keep your people fed and your keep standing.'
          : 'Protect your keep and destroy the hostile stronghold. Grow the economy, forge weapons, and assemble your siege.';
  for (const id of app.selected)
    if (!app.state.units.some((u) => u.id === id && app.owned(u))) app.selected.delete(id);
  app.selectionInfo();
  app.refreshAffordability();
  $('pause').textContent = app.paused ? '▶' : 'Ⅱ';
  $('pause').setAttribute('aria-label', app.paused ? 'Resume game' : 'Pause game');
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.classList.toggle('active', Number(b.dataset.speed) === app.speed);
  for (const id of ['save', 'load', 'pause'] as const) $(id).disabled = app.online;
  $('save').disabled = app.online || !app.started || app.state.status !== 'playing';
  $('save').hidden = app.online;
  $('load').hidden = app.online;
  document.querySelector<HTMLElement>('.time-controls>div')!.hidden = app.online;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.disabled = app.online;
  if (app.state.events.length) {
    const e = app.state.events.at(-1)!,
      signature = `${e.time}:${e.text}`;
    if (signature !== app.lastEventSignature) {
      app.lastEventSignature = signature;
      app.toast(e.text);
    }
  }
  if (app.started && app.state.status !== 'playing' && app.modal !== 'result') app.showResult();
  if (app.modal === 'stockpile') app.renderStockpile();
}
export function bindHud(app: ClientContext): void {
  $('tax').onchange = () => app.act({ type: 'policy', tax: Number($('tax').value) });
  $('rations').onchange = () => app.act({ type: 'policy', rations: Number($('rations').value) });
  $('invasion').onclick = () => app.act({ type: 'invade' });
}
