import type { Mode } from './store';

export interface Route {
  mode: 'walk' | 'scene';
  id?: string;
}

/** `#/work/<id>` = that card at the front of the ring, `#/scene/<id>` = its live scene open, anything else = the ring as it is. */
export function parseHash(hash: string, ids: readonly string[]): Route {
  const m = /^#\/(work|scene)\/([\w-]+)$/.exec(hash);
  if (!m || !ids.includes(m[2])) return { mode: 'walk' };
  return { mode: m[1] === 'scene' ? 'scene' : 'walk', id: m[2] };
}

export function toHash(mode: Mode, id: string): string {
  return `#/${mode === 'scene' ? 'scene' : 'work'}/${id}`;
}
