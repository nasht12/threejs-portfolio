import type { Mode } from './store';

export interface Route {
  mode: Mode;
  id?: string;
}

/** `#/work/<id>` = standing at a frame, `#/scene/<id>` = inside the live scene, anything else = the hall. */
export function parseHash(hash: string, ids: readonly string[]): Route {
  const m = /^#\/(work|scene)\/([\w-]+)$/.exec(hash);
  if (!m || !ids.includes(m[2])) return { mode: 'walk' };
  return { mode: m[1] === 'scene' ? 'scene' : 'focus', id: m[2] };
}

export function toHash(mode: Mode, id: string): string {
  if (mode === 'walk') return '#/';
  return `#/${mode === 'scene' ? 'scene' : 'work'}/${id}`;
}
