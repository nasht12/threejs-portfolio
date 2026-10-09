import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { AdditiveBlending, ExtrudeGeometry, Object3D, Path, Shape, SRGBColorSpace } from 'three';
import { useGallery, effectiveQuality } from '../state/store';
import type { Work } from '../data/works';
import { asset } from '../config';
import { ART_Y, BORDER, artSize, xOf } from './layout';
import { poolTexture } from './textures';
import { useLoopTexture } from './useLoopTexture';

/** A gilt moulding: a rectangle with a rectangular hole, extruded with a bevel so it catches light. */
function useMoulding(w: number, h: number) {
  return useMemo(() => {
    const ow = w / 2 + BORDER, oh = h / 2 + BORDER;
    const shape = new Shape().moveTo(-ow, -oh).lineTo(ow, -oh).lineTo(ow, oh).lineTo(-ow, oh).closePath();
    shape.holes.push(new Path().moveTo(-w / 2, -h / 2).lineTo(-w / 2, h / 2).lineTo(w / 2, h / 2).lineTo(w / 2, -h / 2).closePath());
    const geo = new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.028, bevelSegments: 3, curveSegments: 1 });
    geo.translate(0, 0, -0.02);
    return geo;
  }, [w, h]);
}

export function Artwork({ work, index }: { work: Work; index: number }) {
  const poster = useTexture(asset(work.poster), t => { t.colorSpace = SRGBColorSpace; t.anisotropy = 8; });
  const selected = useGallery(s => s.index === index);
  const focused = useGallery(s => s.index === index && s.mode === 'focus');
  const high = useGallery(s => effectiveQuality(s) === 'high');
  const reduced = useGallery(s => s.reducedMotion);
  const video = useLoopTexture(work.loop && asset(work.loop), focused && high && !reduced);

  const { w, h } = artSize(work.aspect);
  const moulding = useMoulding(w, h);
  const lampTarget = useMemo(() => new Object3D(), []);
  const lampY = h / 2 + BORDER + 0.32;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // that was a drag, not a click
    e.stopPropagation();
    const s = useGallery.getState();
    if (s.mode === 'focus' && s.index === index) s.openScene();
    else s.focus(index);
  };
  const setCursor = (c: string) => (e: ThreeEvent<PointerEvent>) => {
    (e.nativeEvent.target as HTMLElement | null)?.style.setProperty('cursor', c);
  };

  return (
    <group position={[xOf(index), ART_Y, 0]}>
      <mesh geometry={moulding}>
        <meshStandardMaterial color="#c9a04e" metalness={0.72} roughness={0.36} envMapIntensity={1.8} />
      </mesh>

      <mesh position-z={0.012} onClick={onClick} onPointerOver={setCursor('pointer')} onPointerOut={setCursor('')}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={video ?? poster} toneMapped={false} />
      </mesh>

      {/* the lamp's light on the wall: a cheap additive pool on every tier */}
      <mesh position={[0, h * 0.05, 0.004]} renderOrder={-1}>
        <planeGeometry args={[w * 1.9, h * 2.1]} />
        <meshBasicMaterial map={poolTexture()} color="#ffd9ad" transparent blending={AdditiveBlending} depthWrite={false} opacity={(selected ? 0.2 : 0.1) * (high ? 0.55 : 1)} />
      </mesh>

      {/* picture lamp: brass bar on an arm */}
      <group position={[0, lampY, 0.2]}>
        <mesh rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.028, 0.028, w * 0.42, 16]} />
          <meshStandardMaterial color="#c9a45a" metalness={1} roughness={0.3} emissive="#ffd9a0" emissiveIntensity={selected ? 0.35 : 0.08} />
        </mesh>
        <mesh position={[0, -0.12, -0.1]} rotation-x={0.9}>
          <cylinderGeometry args={[0.008, 0.008, 0.3, 8]} />
          <meshStandardMaterial color="#6d5428" metalness={1} roughness={0.4} />
        </mesh>
      </group>

      {high && (
        <>
          <primitive object={lampTarget} position={[0, -h * 0.15, 0]} />
          <spotLight
            position={[0, lampY, 0.55]}
            target={lampTarget}
            angle={0.7}
            penumbra={0.95}
            distance={6}
            decay={2}
            intensity={selected ? 22 : 10}
            color="#ffd6a3"
          />
        </>
      )}
    </group>
  );
}
