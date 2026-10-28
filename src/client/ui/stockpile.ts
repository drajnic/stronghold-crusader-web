import type { ResourceKey } from '../../game/index.js';
import * as sim from '../../game/index.js';
import { income } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import { element as $, buttonTarget, entries, esc, fmt, patchContent } from './dom.js';
export function renderStockpile(app: ClientContext) {
  const market = app.state.buildings.some((b) => app.owned(b) && b.type === 'market' && b.hp > 0);
  const html =
    entries(app.resources())
      .map(([key, value]) => {
        const p = sim.PRICES?.[key],
          buy = typeof p === 'number' ? p : p?.buy,
          sell = typeof p === 'number' ? Math.max(1, Math.floor(p * 0.6)) : p?.sell;
        return `<div class="stock-row"><span>${esc(fmt(key))}<small>${Number(income(app.state, app.team)[key] || 0).toFixed(1)} /s</small></span><b>${Math.floor(value)}</b>${key !== 'gold' && buy ? `<button data-trade="${key}" data-buy="true" ${!market || (app.resources().gold || 0) < buy * 10 || value + 10 > sim.storageCapacity(app.state, key, app.team) ? 'disabled' : ''} title="Buy 10 for ${buy * 10} gold · capacity ${sim.storageCapacity(app.state, key, app.team)}">+10 <small>${buy * 10}g</small></button><button data-trade="${key}" data-buy="false" ${!market || value < 10 ? 'disabled' : ''} title="Sell 10 for ${sell * 10} gold">−10 <small>${sell * 10}g</small></button>` : '<small>RESERVE</small>'}</div>`;
      })
      .join('') +
    (!market ? '<p class="trade-note">Build a market to open the caravan trade.</p>' : '');
  patchContent($('stockpile-list'), html);
}
export function bindStockpile(app: ClientContext): void {
  $('stockpile-list').onclick = (e) => {
    const b = buttonTarget(e);
    if (b)
      void app.act({
        type: 'trade',
        resource: b.dataset.trade as ResourceKey,
        amount: 10,
        buy: b.dataset.buy === 'true',
      });
  };
}
