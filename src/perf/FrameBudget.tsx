import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGallery, effectiveQuality } from '../state/store';
import { IDLE_GAP_MS, WINDOW, median, shouldDecline } from './budget';
import { statsSink } from './statsSink';

/**
 * Measures active frame times (idle gaps excluded, since the canvas renders on demand),
 * asks the store to drop to the light tier when the median frame runs over budget,
 * and, if the stats panel is open, reports what the GPU is being asked to do.
 */
export function FrameBudget() {
  const gl = useThree(s => s.gl);
  const samples = useRef<number[]>([]);
  const last = useRef(0);
  const shown = useRef(0);

  useFrame(() => {
    const now = performance.now();
    const gap = now - last.current;
    last.current = now;
    if (gap > 0 && gap < IDLE_GAP_MS) {
      const xs = samples.current;
      xs.push(gap);
      if (xs.length > WINDOW * 2) xs.splice(0, xs.length - WINDOW);
      if (shouldDecline(xs)) {
        useGallery.getState().declineQuality();
        xs.length = 0;
      }
    }

    const s = useGallery.getState();
    const el = statsSink.el;
    if (!s.showStats || !el || now - shown.current < 250) return;
    shown.current = now;
    const xs = samples.current.slice(-WINDOW);
    const { calls, triangles } = gl.info.render;
    const { geometries, textures } = gl.info.memory;
    el.textContent = [
      `frame   ${xs.length ? median(xs).toFixed(1) + ' ms (median)' : 'idle'}`,
      `calls   ${calls}`,
      `tris    ${triangles.toLocaleString()}`,
      `gpu     ${geometries} geometries · ${textures} textures · ${gl.info.programs?.length ?? 0} programs`,
      `dpr     ${gl.getPixelRatio().toFixed(2)} · tier ${effectiveQuality(s)}${s.qualitySetting === 'auto' ? ' (auto)' : ''}`,
    ].join('\n');
  });

  return null;
}
