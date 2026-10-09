import { describe, expect, it } from 'vitest';
import { createSceneLinkStore, parseSceneMessage } from './sceneLink';

const ready = {
  from: 'scene', type: 'ready',
  options: { view: [{ id: 'home', label: 'Painting' }, { id: 'sea', label: 'Sea' }], light: [{ id: 'rain', label: 'Rain' }] },
  look: { view: 'home', light: 'rain', style: 'natural' },
};

describe('scene messages', () => {
  it('accepts the scene protocol', () => {
    expect(parseSceneMessage(ready)).toMatchObject({ type: 'ready', look: { light: 'rain' } });
    expect(parseSceneMessage({ from: 'scene', type: 'perf', fps: 31.5, rung: '9/9', scale: '0.50', grass: null }))
      .toEqual({ type: 'perf', perf: { fps: 31.5, rung: '9/9', scale: '0.50', grass: null } });
  });

  it('ignores anything else, and drops malformed fields instead of trusting them', () => {
    expect(parseSceneMessage({ type: 'look', look: {} })).toBeNull(); // not from a scene
    expect(parseSceneMessage('hello')).toBeNull();
    expect(parseSceneMessage({ from: 'scene', type: 'perf', fps: 'fast' })).toBeNull();
    const m = parseSceneMessage({ from: 'scene', type: 'ready', options: { view: [{ id: 3 }, { id: 'sea', label: 'Sea' }], bogus: [] }, look: { view: { x: 1 }, light: 'day' } });
    expect(m).toEqual({ type: 'ready', options: { view: [{ id: 'sea', label: 'Sea' }] }, look: { light: 'day' } });
  });
});

describe('scene link store', () => {
  it('follows the scene and resets when it closes', () => {
    const s = createSceneLinkStore();
    s.getState().receive(ready);
    s.getState().receive({ from: 'scene', type: 'look', look: { view: 'sea', light: 'rain', style: 'painted' } });
    expect(s.getState().look).toEqual({ view: 'sea', light: 'rain', style: 'painted' });
    expect(s.getState().options?.view).toHaveLength(2);
    s.getState().reset();
    expect(s.getState()).toMatchObject({ options: null, look: null, perf: null });
  });
});
