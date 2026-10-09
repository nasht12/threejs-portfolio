import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { MeshPortalMaterial, Text, useTexture } from '@react-three/drei';
import { geometry } from 'maath';
import { Color, FrontSide, MathUtils, SRGBColorSpace, Vector3, type Group, type MeshBasicMaterial, type Texture } from 'three';
import { useGallery, effectiveQuality } from '../state/store';
import type { Work } from '../data/works';
import { asset } from '../config';
import { useLoopTexture } from '../gallery/useLoopTexture';
import { CARD, DEPTH, angleOf, backdropSize, radiusFor, windowCrop } from './layout';
import { ease, transition } from './transition';
import { hideDetailsSoon, showDetails } from '../ui/details';

const DIM = new Color('#9c9c9c');
const FULL = new Color('#ffffff');
const SMALL_FONT = asset('fonts/inter-500.woff');

/** The scene seen through the live portal: the poster (or its loop) hung DEPTH metres behind the card. */
function Inside({ map, aspect }: { map: Texture; aspect: number }) {
  const { w, h } = backdropSize(aspect);
  return (
    <>
      <color attach="background" args={['#0b0b0b']} />
      <mesh position={[0, 0, -DEPTH]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
    </>
  );
}

/**
 * One card on the ring. Only the front card renders a real MeshPortalMaterial (each one costs three
 * screen-sized render targets per frame). The others fake the same window on one textured quad:
 * a crop of the poster that slides with the viewing angle, matching what the portal would show.
 */
export function Card({ work, index, count }: { work: Work; index: number; count: number }) {
  const poster = useTexture(asset(work.poster), t => { t.colorSpace = SRGBColorSpace; t.anisotropy = 8; });
  const front = useGallery(s => s.index === index);
  const high = useGallery(s => effectiveQuality(s) === 'high');
  const reduced = useGallery(s => s.reducedMotion);
  const video = useLoopTexture(work.loop && asset(work.loop), front && high && !reduced);
  const invalidate = useThree(s => s.invalidate);

  const shape = useMemo(() => new geometry.RoundedPlaneGeometry(CARD.w, CARD.h, CARD.r), []);
  useEffect(() => () => shape.dispose(), [shape]);

  // the fake window's own copy of the poster, so its crop doesn't move other cards
  const fake = useMemo(() => { const t = poster.clone(); t.needsUpdate = true; return t; }, [poster]);
  useEffect(() => () => fake.dispose(), [fake]);

  const group = useRef<Group>(null);
  const fakeMat = useRef<MeshBasicMaterial>(null);
  // MeshPortalMaterial's instance: we only touch its blend
  const portal = useRef<{ blend: number } | null>(null);
  const local = useMemo(() => new Vector3(), []);
  const a = angleOf(index, count);
  const r = radiusFor(count);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const s = useGallery.getState();
    const k = s.reducedMotion ? 1e4 : 6;

    // highlight: the front card is full size and full brightness, the rest recede
    const scale = MathUtils.damp(g.scale.x, front ? 1 : 0.84, k, dt);
    g.scale.setScalar(scale);
    let moving = Math.abs(scale - (front ? 1 : 0.84)) > 1e-3;

    if (fakeMat.current) {
      local.copy(state.camera.position);
      g.worldToLocal(local);
      // cards turned away from the camera (the far side of the ring) aren't drawn at all, titles included
      const facing = local.z > 0.3;
      if (g.visible !== facing) { g.visible = facing; moving = true; }
      if (!facing) { if (moving) invalidate(); return; }
      fakeMat.current.color.lerp(front ? FULL : DIM, 1 - Math.exp(-k * dt));
      const c = windowCrop(work.aspect, local);
      fake.repeat.set(c.rx, c.ry);
      fake.offset.set(c.ox, c.oy);
    }

    if (front) g.visible = true;
    if (front && portal.current) {
      const target = s.mode === 'focus' ? 1 : 0;
      transition.value = MathUtils.damp(transition.value, target, s.reducedMotion ? 1e4 : 3.2, dt);
      portal.current.blend = ease(transition.value);
      if (target === 1 && transition.value > 0.985) s.openScene();
      if (Math.abs(transition.value - target) > 1e-3) moving = true;
    }
    if (moving) invalidate();
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // a drag that ended here, not a click
    e.stopPropagation();
    const s = useGallery.getState();
    if (s.index === index) s.focus(index);
    else s.select(index);
  };
  const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
    (e.nativeEvent.target as HTMLElement | null)?.style.setProperty('cursor', on ? 'pointer' : '');
    if (useGallery.getState().index !== index) return;
    if (on) showDetails();
    else hideDetailsSoon();
  };

  return (
    <group position={[r * Math.sin(a), 0, r * Math.cos(a)]} rotation-y={a}>
      <group ref={group} scale={0.84}>
        <mesh geometry={shape} onClick={onClick} onPointerOver={hover(true)} onPointerOut={hover(false)}>
          {front ? (
            <MeshPortalMaterial ref={portal as never} side={FrontSide} blur={0} resolution={256}>
              <Inside map={video ?? poster} aspect={work.aspect} />
            </MeshPortalMaterial>
          ) : (
            <meshBasicMaterial ref={fakeMat} map={fake} color={DIM} toneMapped={false} />
          )}
        </mesh>
        <Text font={SMALL_FONT} fontSize={0.062} anchorX="left" anchorY="bottom" color="#ffffff" fillOpacity={0.85} position={[-CARD.w / 2 + 0.11, -CARD.h / 2 + 0.09, 0.01]}>
          {`${String(index + 1).padStart(2, '0')}  /${work.id}`}
        </Text>
      </group>
    </group>
  );
}
