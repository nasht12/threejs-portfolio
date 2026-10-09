import { create } from 'zustand';

/*
 * The link to the live scene in the viewer's iframe: a separate store from the gallery, because it has its own
 * lifetime (one scene at a time, reset on close) and its own source of truth (the scene, over postMessage).
 *
 * Protocol (same origin only):
 *   scene → portfolio  { from:'scene', type:'ready', options, look } · { type:'look', look } · { type:'perf', fps, rung, scale, grass }
 *   portfolio → scene  { to:'scene', type:'hello' } · { to:'scene', type:'set-look', look }
 */
export const LOOK_GROUPS = [
  ['view', 'Viewpoint'],
  ['light', 'Light and weather'],
  ['style', 'Style'],
] as const;
export type LookKey = (typeof LOOK_GROUPS)[number][0];
export interface LookOption { id: string; label: string }
export type SceneOptions = Partial<Record<LookKey, LookOption[]>>;
export type SceneLook = Partial<Record<LookKey, string>>;
export interface ScenePerf { fps: number; rung: string | null; scale: string | null; grass: string | null }

export type SceneMessage =
  | { type: 'ready'; options: SceneOptions; look: SceneLook }
  | { type: 'look'; look: SceneLook }
  | { type: 'perf'; perf: ScenePerf };

const KEYS = LOOK_GROUPS.map(([k]) => k) as LookKey[];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown) => (typeof v === 'string' && v.length < 80 ? v : null);

function readLook(v: unknown): SceneLook {
  const out: SceneLook = {};
  if (isObj(v)) for (const k of KEYS) { const s = str(v[k]); if (s) out[k] = s; }
  return out;
}
function readOptions(v: unknown): SceneOptions {
  const out: SceneOptions = {};
  if (!isObj(v)) return out;
  for (const k of KEYS) {
    const list = v[k];
    if (!Array.isArray(list)) continue;
    const opts = list.flatMap(o => (isObj(o) && str(o.id) && str(o.label) ? [{ id: o.id as string, label: o.label as string }] : []));
    if (opts.length) out[k] = opts.slice(0, 24);
  }
  return out;
}

/** Validate a message from the scene. The iframe is ours, but the shape is still checked, not trusted. */
export function parseSceneMessage(data: unknown): SceneMessage | null {
  if (!isObj(data) || data.from !== 'scene') return null;
  if (data.type === 'ready') return { type: 'ready', options: readOptions(data.options), look: readLook(data.look) };
  if (data.type === 'look') return { type: 'look', look: readLook(data.look) };
  if (data.type === 'perf' && typeof data.fps === 'number' && Number.isFinite(data.fps)) {
    return { type: 'perf', perf: { fps: data.fps, rung: str(data.rung), scale: str(data.scale), grass: str(data.grass) } };
  }
  return null;
}

interface SceneLinkState {
  options: SceneOptions | null;
  look: SceneLook | null;
  perf: ScenePerf | null;
  receive: (data: unknown) => void;
  reset: () => void;
}

export const createSceneLinkStore = () => create<SceneLinkState>()(set => ({
  options: null,
  look: null,
  perf: null,
  receive: data => {
    const m = parseSceneMessage(data);
    if (!m) return;
    if (m.type === 'ready') set({ options: m.options, look: m.look });
    else if (m.type === 'look') set({ look: m.look });
    else set({ perf: m.perf });
  },
  reset: () => set({ options: null, look: null, perf: null }),
}));

export const useSceneLink = createSceneLinkStore();
