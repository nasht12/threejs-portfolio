import { describe, expect, it } from 'vitest';
import { createGalleryStore, effectiveQuality, guessQuality, qualityFromQuery, MAX_EVENTS } from './store';
import { parseHash, toHash } from './route';
import { WORKS } from '../data/works';

const fresh = () => createGalleryStore();

describe('selection', () => {
  it('steps forward and wraps at both ends', () => {
    const s = fresh();
    s.getState().step(-1);
    expect(s.getState().index).toBe(WORKS.length - 1);
    s.getState().step(1);
    expect(s.getState().index).toBe(0);
  });

  it('keeps standing at a frame when the selection moves while focused', () => {
    const s = fresh();
    s.getState().focus(2);
    s.getState().step(1);
    expect(s.getState()).toMatchObject({ index: 3, mode: 'focus' });
  });

  it('ignores selection while a scene is open', () => {
    const s = fresh();
    s.getState().focus(1);
    s.getState().openScene();
    s.getState().select(4);
    expect(s.getState().index).toBe(1);
  });
});

describe('mode transitions', () => {
  it('walk → focus → scene → focus → walk', () => {
    const s = fresh();
    const { focus, openScene, closeScene, unfocus } = s.getState();
    focus(3);
    expect(s.getState().mode).toBe('focus');
    openScene();
    expect(s.getState().mode).toBe('scene');
    closeScene();
    expect(s.getState()).toMatchObject({ mode: 'focus', index: 3 });
    unfocus();
    expect(s.getState().mode).toBe('walk');
  });

  it('logs every transition once, in order, with the work id', () => {
    const s = fresh();
    s.getState().focus(1);
    s.getState().focus(1); // no-op: already there
    s.getState().openScene();
    s.getState().closeScene();
    expect(s.getState().events.map(e => `${e.type}:${e.id}`)).toEqual([
      `focus:${WORKS[1].id}`,
      `open:${WORKS[1].id}`,
      `close:${WORKS[1].id}`,
    ]);
  });

  it('caps the event log', () => {
    const s = fresh();
    for (let i = 0; i < MAX_EVENTS + 50; i++) s.getState().step(1);
    expect(s.getState().events).toHaveLength(MAX_EVENTS);
  });
});

describe('quality', () => {
  it('the frame-budget monitor can only lower an automatic setting', () => {
    const s = fresh();
    s.getState().declineQuality();
    expect(effectiveQuality(s.getState())).toBe('low');

    const pinned = fresh();
    pinned.getState().setQualitySetting('high');
    pinned.getState().declineQuality();
    expect(effectiveQuality(pinned.getState())).toBe('high');
  });

  it('starts small machines on the light tier', () => {
    expect(guessQuality({ hardwareConcurrency: 4 })).toBe('low');
    expect(guessQuality({ hardwareConcurrency: 16, deviceMemory: 4 })).toBe('low');
    expect(guessQuality({ hardwareConcurrency: 12, deviceMemory: 16 })).toBe('high');
    expect(guessQuality({})).toBe('high');
  });

  it('starts slow or metered connections on the light tier', () => {
    const fast = { hardwareConcurrency: 12, deviceMemory: 16 };
    expect(guessQuality({ ...fast, connection: { effectiveType: '4g', downlink: 20 } })).toBe('high');
    expect(guessQuality({ ...fast, connection: { effectiveType: '3g' } })).toBe('low');
    expect(guessQuality({ ...fast, connection: { effectiveType: 'slow-2g' } })).toBe('low');
    expect(guessQuality({ ...fast, connection: { downlink: 0.8 } })).toBe('low');
    expect(guessQuality({ ...fast, connection: { saveData: true } })).toBe('low');
  });

  it('reads a pinned tier from the query string', () => {
    expect(qualityFromQuery('?quality=low')).toBe('low');
    expect(qualityFromQuery('?quality=high')).toBe('high');
    expect(qualityFromQuery('?quality=ultra')).toBe('auto');
    expect(qualityFromQuery('')).toBe('auto');
  });
});

describe('routes', () => {
  const ids = WORKS.map(w => w.id);
  it('round-trips focus and scene routes', () => {
    for (const mode of ['focus', 'scene'] as const) {
      expect(parseHash(toHash(mode, ids[2]), ids)).toEqual({ mode, id: ids[2] });
    }
  });
  it('falls back to the hall for unknown or malformed hashes', () => {
    expect(parseHash('#/scene/not-a-work', ids)).toEqual({ mode: 'walk' });
    expect(parseHash('#/scene/../etc', ids)).toEqual({ mode: 'walk' });
    expect(parseHash('', ids)).toEqual({ mode: 'walk' });
  });
});
