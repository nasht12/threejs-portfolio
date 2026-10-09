import { create } from 'zustand';
import { WORKS, type Work } from '../data/works';

/** walk = turning the ring · focus = diving through the front card's portal · scene = live scene open */
export type Mode = 'walk' | 'focus' | 'scene';
export type Quality = 'high' | 'low';
export type QualitySetting = 'auto' | Quality;
export type SelectSource = 'walk' | 'ui';

export interface GalleryEvent {
  t: number;
  type: 'select' | 'focus' | 'unfocus' | 'open' | 'close' | 'quality';
  id?: string;
  detail?: string;
}

export interface GalleryState {
  works: readonly Work[];
  index: number;
  mode: Mode;
  /** What the visitor chose. 'auto' defers to autoQuality, which the frame-budget monitor may lower. */
  qualitySetting: QualitySetting;
  autoQuality: Quality;
  showStats: boolean;
  /** The details panel is open: the front card is hovered, or keyboard focus is on the list or the panel. */
  details: boolean;
  reducedMotion: boolean;
  /** Append-only interaction log (capped). Useful for analytics, replay and tests. */
  events: GalleryEvent[];

  select: (i: number, source?: SelectSource) => void;
  step: (delta: 1 | -1) => void;
  focus: (i?: number) => void;
  unfocus: () => void;
  openScene: () => void;
  closeScene: () => void;
  setQualitySetting: (q: QualitySetting) => void;
  /** Called by the frame-budget monitor when frames run long. Ignored unless the setting is 'auto'. */
  declineQuality: () => void;
  toggleStats: () => void;
  setDetails: (open: boolean) => void;
  setReducedMotion: (on: boolean) => void;
}

export const MAX_EVENTS = 200;
export const wrap = (i: number, n: number) => ((i % n) + n) % n;
export const effectiveQuality = (s: Pick<GalleryState, 'qualitySetting' | 'autoQuality'>): Quality =>
  s.qualitySetting === 'auto' ? s.autoQuality : s.qualitySetting;

export interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
}

/**
 * First guess before anything is measured. Small machines and slow or metered connections start
 * on the light tier (no preview video, no reflection pass). The load-time check and the frame-budget
 * monitor can still lower it later; nothing raises it.
 */
export function guessQuality(nav: DeviceHints): Quality {
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return 'low';
  if ((nav.hardwareConcurrency ?? 8) <= 4) return 'low';
  const c = nav.connection;
  if (c?.saveData) return 'low';
  if (c?.effectiveType && /(^|-)(2g|3g)$/.test(c.effectiveType)) return 'low';
  if (c?.downlink !== undefined && c.downlink > 0 && c.downlink < 1.5) return 'low';
  return 'high';
}

/** `?quality=low|high` pins the tier: for demos and tests. Anything else leaves it automatic. */
export function qualityFromQuery(search: string): QualitySetting {
  const q = new URLSearchParams(search).get('quality');
  return q === 'low' || q === 'high' ? q : 'auto';
}

type Init = Partial<Pick<GalleryState, 'works' | 'index' | 'mode' | 'qualitySetting' | 'autoQuality' | 'reducedMotion'>>;

export function createGalleryStore(init: Init = {}) {
  return create<GalleryState>()((set, get) => {
    const logged = (e: Omit<GalleryEvent, 't'>, patch: Partial<GalleryState> = {}) =>
      set(s => ({ ...patch, events: [...s.events, { t: performance.now(), ...e }].slice(-MAX_EVENTS) }));
    const idAt = (i: number) => get().works[i]?.id;

    return {
      works: WORKS,
      index: 0,
      mode: 'walk',
      qualitySetting: 'auto',
      autoQuality: 'high',
      showStats: false,
      details: false,
      reducedMotion: false,
      events: [],
      ...init,

      select: (i, source = 'ui') => {
        const s = get();
        if (s.mode === 'scene') return;
        const index = wrap(i, s.works.length);
        if (index === s.index) return;
        logged({ type: 'select', id: idAt(index), detail: source }, { index });
      },
      step: delta => get().select(get().index + delta),
      focus: (i = get().index) => {
        const s = get();
        if (s.mode === 'scene') return;
        const index = wrap(i, s.works.length);
        if (s.mode === 'focus' && index === s.index) return;
        logged({ type: 'focus', id: idAt(index) }, { index, mode: 'focus' });
      },
      unfocus: () => {
        if (get().mode !== 'focus') return;
        logged({ type: 'unfocus', id: idAt(get().index) }, { mode: 'walk' });
      },
      openScene: () => {
        if (get().mode === 'scene') return;
        logged({ type: 'open', id: idAt(get().index) }, { mode: 'scene' });
      },
      closeScene: () => {
        if (get().mode !== 'scene') return;
        logged({ type: 'close', id: idAt(get().index) }, { mode: 'walk' });
      },
      setQualitySetting: q => {
        if (q === get().qualitySetting) return;
        logged({ type: 'quality', detail: q }, { qualitySetting: q });
      },
      declineQuality: () => {
        const s = get();
        if (s.qualitySetting !== 'auto' || s.autoQuality === 'low') return;
        logged({ type: 'quality', detail: 'auto-low' }, { autoQuality: 'low' });
      },
      toggleStats: () => set(s => ({ showStats: !s.showStats })),
      setDetails: open => { if (get().details !== open) set({ details: open }); },
      setReducedMotion: on => set({ reducedMotion: on }),
    };
  });
}

const nav: DeviceHints = typeof navigator === 'undefined' ? {} : (navigator as unknown as DeviceHints);
const reduced = typeof matchMedia === 'undefined' ? false : matchMedia('(prefers-reduced-motion: reduce)').matches;

export const useGallery = createGalleryStore({
  autoQuality: guessQuality(nav),
  qualitySetting: typeof location === 'undefined' ? 'auto' : qualityFromQuery(location.search),
  reducedMotion: reduced,
});
