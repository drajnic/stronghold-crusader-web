import type { ResourceCost } from '../../game/index.js';
interface Elements {
  app: HTMLElement;
  'menu-button': HTMLButtonElement;
  resources: HTMLElement;
  'stockpile-button': HTMLButtonElement;
  save: HTMLButtonElement;
  load: HTMLButtonElement;
  help: HTMLButtonElement;
  battlefield: HTMLElement;
  world: HTMLCanvasElement;
  'mode-label': HTMLElement;
  'wave-label': HTMLElement;
  'wave-countdown': HTMLElement;
  objectives: HTMLElement;
  'objective-copy': HTMLElement;
  'dismiss-objectives': HTMLButtonElement;
  'show-objectives': HTMLButtonElement;
  toast: HTMLElement;
  'placement-hint': HTMLElement;
  'zoom-out': HTMLButtonElement;
  'zoom-label': HTMLElement;
  'zoom-in': HTMLButtonElement;
  home: HTMLButtonElement;
  tabs: HTMLElement;
  'build-list': HTMLElement;
  'ledger-note': HTMLElement;
  popularity: HTMLElement;
  tax: HTMLSelectElement;
  rations: HTMLSelectElement;
  'popularity-detail': HTMLElement;
  'ruler-status': HTMLElement;
  'ruler-meter': HTMLMeterElement;
  'ruler-effects': HTMLElement;
  invasion: HTMLButtonElement;
  minimap: HTMLCanvasElement;
  'keep-status': HTMLElement;
  'keep-health': HTMLElement;
  population: HTMLElement;
  workers: HTMLElement;
  'selection-info': HTMLElement;
  pause: HTMLButtonElement;
  clock: HTMLElement;
  'connection-state': HTMLElement;
  'modal-backdrop': HTMLElement;
  menu: HTMLElement;
  resume: HTMLButtonElement;
  'load-saved': HTMLButtonElement;
  skirmish: HTMLElement;
  difficulty: HTMLSelectElement;
  opponent: HTMLSelectElement;
  'start-skirmish': HTMLButtonElement;
  campaign: HTMLElement;
  missions: HTMLElement;
  multiplayer: HTMLElement;
  'player-name': HTMLInputElement;
  'multiplayer-mode': HTMLSelectElement;
  'create-room': HTMLButtonElement;
  'room-code': HTMLInputElement;
  'join-room': HTMLButtonElement;
  'network-error': HTMLElement;
  lobby: HTMLElement;
  'lobby-code': HTMLElement;
  'lobby-copy': HTMLElement;
  'lobby-players': HTMLElement;
  'start-room': HTMLButtonElement;
  'leave-room': HTMLButtonElement;
  stockpile: HTMLElement;
  'stockpile-list': HTMLElement;
  guide: HTMLElement;
  settings: HTMLElement;
  sound: HTMLSelectElement;
  'camera-speed': HTMLInputElement;
  'battle-menu': HTMLElement;
  'resume-battle': HTMLButtonElement;
  'request-leave': HTMLButtonElement;
  'leave-confirm': HTMLElement;
  'confirm-leave': HTMLButtonElement;
  'cancel-leave': HTMLButtonElement;
  result: HTMLElement;
  'result-icon': HTMLElement;
  'result-copy': HTMLElement;
  'result-stats': HTMLElement;
  'next-mission': HTMLButtonElement;
  'play-again': HTMLButtonElement;
  'result-menu': HTMLButtonElement;
}
export function element<K extends keyof Elements>(id: K): Elements[K];
export function element(id: string): HTMLElement;
export function element(id: string): HTMLElement {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing interface element: ${id}`);
  return result;
}
export function optionalElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}
export const names: Record<string, string> = {
  settlement: 'Settlement',
  food: 'Food',
  industry: 'Industry',
  castle: 'Castle',
  defenses: 'Castle',
  european: 'European',
  mercenary: 'Mercenary',
  siege: 'Siege',
  army: 'Army',
};
export const fmt = (value: unknown): string =>
  String(value)
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
export const time = (n: number): string =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export const esc = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export const costText = (cost: ResourceCost): string =>
  Object.entries(cost)
    .map(([key, value]) => `${value} ${fmt(key)}`)
    .join(' · ') || 'No resource cost';
export function patchContent(root: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;
  const patch = (parent: Node, desired: Node): void => {
    const next = [...desired.childNodes];
    for (let i = 0; i < next.length; i++) {
      const incoming = next[i];
      const current = parent.childNodes[i];
      if (
        !current ||
        current.nodeType !== incoming.nodeType ||
        current.nodeName !== incoming.nodeName
      ) {
        const copy = incoming.cloneNode(true);
        if (current) current.replaceWith(copy);
        else parent.appendChild(copy);
        continue;
      }
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.nodeValue !== incoming.nodeValue) current.nodeValue = incoming.nodeValue;
      } else if (current.nodeType === Node.ELEMENT_NODE) {
        if (!(current instanceof Element) || !(incoming instanceof Element)) continue;
        for (const attr of [...current.attributes]) {
          if (!incoming.hasAttribute(attr.name)) current.removeAttribute(attr.name);
        }
        for (const attr of incoming.attributes) {
          if (current.getAttribute(attr.name) !== attr.value)
            current.setAttribute(attr.name, attr.value);
        }
        patch(current, incoming);
      }
    }
    while (parent.childNodes.length > next.length) parent.removeChild(parent.lastChild!);
  };
  patch(root, template.content);
}
export function buttonTarget(event: Event): HTMLButtonElement | null {
  return event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The operation could not be completed.';
}
export function entries<T extends object>(value: T): [keyof T, T[keyof T]][] {
  return Object.entries(value) as [keyof T, T[keyof T]][];
}
