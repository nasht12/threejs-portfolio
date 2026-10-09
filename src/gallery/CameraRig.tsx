import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Vector3 } from 'three';
import { useGallery } from '../state/store';
import { ART_Y, EYE, FOV, WALK_Z, artSize, focusDistance, nearestIndex, walkLimits, xOf } from './layout';

const DRAG_THRESHOLD_PX = 6;
const FOLLOW = 4; // damping rate toward the target pose, per second
const SNAP = 2.2; // how quickly an idle walk settles onto the nearest frame

interface RigState {
  walkX: number;
  vel: number;
  dragging: boolean;
  dragPx: number;
  lastX: number;
  lastT: number;
  /** The index this rig selected by walking, so the store subscription can ignore its own echo. */
  walked: number;
  look: Vector3;
}

function targetPose(walkX: number) {
  const s = useGallery.getState();
  if (s.mode === 'focus') {
    const x = xOf(s.index);
    const { h } = artSize(s.works[s.index].aspect);
    return { x, y: ART_Y, z: focusDistance(h, FOV), lx: x, ly: ART_Y };
  }
  return { x: walkX, y: EYE, z: WALK_Z, lx: walkX, ly: ART_Y - 0.1 };
}

/**
 * Owns the camera. Walking state lives in a ref, not React state: it changes every frame and
 * nothing in the React tree needs to re-render for it. The store is read with getState() inside
 * useFrame for the same reason.
 */
export function CameraRig() {
  const camera = useThree(s => s.camera);
  const gl = useThree(s => s.gl);
  const invalidate = useThree(s => s.invalidate);
  const n = useGallery(s => s.works.length);
  const limits = walkLimits(n);
  const rig = useRef<RigState>({
    walkX: xOf(useGallery.getState().index), vel: 0, dragging: false, dragPx: 0, lastX: 0, lastT: 0, walked: -1, look: new Vector3(),
  });

  // Start at the right pose (e.g. returning from a scene), not flying in from the origin.
  useLayoutEffect(() => {
    const p = targetPose(rig.current.walkX);
    camera.position.set(p.x, p.y, p.z);
    rig.current.look.set(p.lx, p.ly, 0);
    camera.lookAt(rig.current.look);
    invalidate();
  }, [camera, invalidate]);

  // Selection changed from the UI (keys, list, caption): walk to it. Any store change wakes the loop.
  useEffect(() => useGallery.subscribe((s, prev) => {
    if (s.index !== prev.index && s.index !== rig.current.walked) {
      rig.current.walkX = xOf(s.index);
      rig.current.vel = 0;
    }
    rig.current.walked = -1;
    invalidate();
  }), [invalidate]);

  // Drag and wheel to walk along the wall.
  useEffect(() => {
    const el = gl.domElement;
    const r = rig.current;
    const metresPerPx = () => (2 * WALK_Z * Math.tan((FOV * Math.PI) / 360)) / Math.max(1, el.clientHeight);
    const leaveFocus = () => { if (useGallery.getState().mode === 'focus') useGallery.getState().unfocus(); };

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      Object.assign(r, { dragging: true, dragPx: 0, lastX: e.clientX, lastT: performance.now(), vel: 0 });
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!r.dragging) return;
      const dx = e.clientX - r.lastX;
      r.lastX = e.clientX;
      r.dragPx += Math.abs(dx);
      if (r.dragPx < DRAG_THRESHOLD_PX) return;
      leaveFocus();
      const d = -dx * metresPerPx();
      r.walkX = MathUtils.clamp(r.walkX + d, limits.min, limits.max);
      const now = performance.now();
      r.vel = (d / Math.max(1, now - r.lastT)) * 16.7; // metres per 60 Hz frame
      r.lastT = now;
      invalidate();
    };
    const up = () => {
      r.dragging = false;
      if (performance.now() - r.lastT > 90) r.vel = 0; // released after a pause: no throw
      invalidate();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) return;
      leaveFocus();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      r.walkX = MathUtils.clamp(r.walkX + d * (e.deltaMode === 1 ? 0.1 : 0.006), limits.min, limits.max);
      r.vel = 0;
      invalidate();
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl, invalidate, limits.min, limits.max]);

  useFrame((_, delta) => {
    const r = rig.current;
    const s = useGallery.getState();
    const dt = Math.min(delta, 0.05);

    if (s.mode === 'walk') {
      if (!r.dragging && r.vel !== 0) {
        r.walkX = MathUtils.clamp(r.walkX + r.vel * dt * 60, limits.min, limits.max);
        r.vel *= Math.pow(0.9, dt * 60);
        if (Math.abs(r.vel) < 1e-4) r.vel = 0;
      }
      const nearest = nearestIndex(r.walkX, n);
      if (nearest !== s.index) {
        r.walked = nearest;
        s.select(nearest, 'walk');
      }
      if (!r.dragging && r.vel === 0) r.walkX = MathUtils.damp(r.walkX, xOf(s.index), SNAP, dt);
    }

    const p = targetPose(r.walkX);
    const k = s.reducedMotion ? 1e4 : FOLLOW;
    camera.position.set(
      MathUtils.damp(camera.position.x, p.x, k, dt),
      MathUtils.damp(camera.position.y, p.y, k, dt),
      MathUtils.damp(camera.position.z, p.z, k, dt),
    );
    r.look.set(MathUtils.damp(r.look.x, p.lx, k, dt), MathUtils.damp(r.look.y, p.ly, k, dt), 0);
    camera.lookAt(r.look);

    const settling =
      Math.abs(camera.position.x - p.x) + Math.abs(camera.position.y - p.y) + Math.abs(camera.position.z - p.z) > 1e-3 ||
      Math.abs(r.look.x - p.lx) > 1e-3 ||
      r.dragging || r.vel !== 0 ||
      (s.mode === 'walk' && Math.abs(r.walkX - xOf(s.index)) > 1e-3);
    if (settling) invalidate();
  });

  return null;
}
