import type { Point } from '../../game/index.js';
import type { MultiplayerView } from '../network.js';
type KeyChord = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>;
export function isGroupChord(event: KeyChord): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && /^[1-9]$/.test(event.key);
}
export function shouldIgnoreShortcut(event: KeyChord): boolean {
  return (event.ctrlKey || event.metaKey || event.altKey) && !isGroupChord(event);
}
export function clampZoom(value: number): number {
  return Math.max(0.35, Math.min(1.6, value));
}
/** Presentation only: snapshots remain authoritative and are never mutated. */
export function interpolatePosition(from: Point, to: Point, elapsedMs: number): Point {
  const t = Math.max(0, Math.min(1, elapsedMs / 190));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
export function requiresLeaveConfirmation(
  online: boolean,
  status: MultiplayerView['status'] | undefined,
): boolean {
  return online && status !== 'finished' && status !== 'aborted';
}

/** A dismiss action must retain the room's lobby instead of exposing offline-only menus. */
export function modalAfterClose(options: {
  current: import('../context.js').Modal;
  returnModal: import('../context.js').Modal;
  online: boolean;
  started: boolean;
  roomStatus: MultiplayerView['status'] | undefined;
}): import('../context.js').Modal {
  if (options.current === 'leave-confirm') return 'battle-menu';
  if (options.online && options.roomStatus === 'lobby') return 'lobby';
  if (options.current === 'battle-menu') return null;
  return options.returnModal || (options.started ? null : 'menu');
}
