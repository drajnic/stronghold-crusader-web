import type { CampaignProgress, Preferences } from '../context.js';
export const SAVE_KEY = 'stronghold-crusader-save-v2';
export const PROGRESS_KEY = 'stronghold-crusader-campaign-v2';
export const SETTINGS_KEY = 'stronghold-crusader-settings-v2';
function readStored(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
  } catch {
    return null;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
export function readPreferences(): Preferences {
  const value = readStored(SETTINGS_KEY);
  return {
    sound: record(value) && value.sound === 'on' ? 'on' : 'off',
    cameraSpeed:
      record(value) && typeof value.cameraSpeed === 'number'
        ? Math.min(24, Math.max(5, value.cameraSpeed))
        : 12,
  };
}
export function readProgress(): CampaignProgress {
  const value = readStored(PROGRESS_KEY);
  return {
    unlocked:
      record(value) && typeof value.unlocked === 'number' && Number.isInteger(value.unlocked)
        ? Math.min(3, Math.max(0, value.unlocked))
        : 0,
  };
}
export class InterfaceAudio {
  private context: AudioContext | null = null;
  play(enabled: 'on' | 'off'): void {
    if (enabled !== 'on') return;
    try {
      this.context ??= new AudioContext();
      const o = this.context.createOscillator(),
        g = this.context.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(370, this.context.currentTime);
      o.frequency.exponentialRampToValueAtTime(190, this.context.currentTime + 0.09);
      g.gain.setValueAtTime(0.035, this.context.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.12);
      o.connect(g).connect(this.context.destination);
      o.start();
      o.stop(this.context.currentTime + 0.13);
    } catch {
      /* Unsupported audio leaves gameplay available. */
    }
  }
}
export class ToastPresenter {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly element: HTMLElement) {}
  show(message: string): void {
    this.element.textContent = message;
    this.element.classList.add('visible');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.element.classList.remove('visible'), 4200);
  }
}
