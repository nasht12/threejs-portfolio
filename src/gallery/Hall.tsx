import { useMemo } from 'react';
import { MeshReflectorMaterial } from '@react-three/drei';
import { plasterTextures } from './textures';
import { wallLength, xOf } from './layout';

const WALL_H = 7;
const TILE_M = 2.4; // one plaster tile covers this many metres

export function Hall({ count, reflective }: { count: number; reflective: boolean }) {
  const length = wallLength(count);
  const centre = xOf(count - 1) / 2;
  const { normal, color } = useMemo(() => {
    const t = plasterTextures();
    for (const tex of [t.normal, t.color]) tex.repeat.set(length / TILE_M, WALL_H / TILE_M);
    return t;
  }, [length]);

  return (
    <group>
      <mesh position={[centre, WALL_H / 2, 0]}>
        <planeGeometry args={[length, WALL_H]} />
        <meshStandardMaterial color="#20241f" map={color} normalMap={normal} normalScale={[0.9, 0.9]} roughness={0.93} envMapIntensity={0.12} />
      </mesh>

      {/* skirting board */}
      <mesh position={[centre, 0.09, 0.02]}>
        <boxGeometry args={[length, 0.18, 0.04]} />
        <meshStandardMaterial color="#0d0e0c" roughness={0.6} envMapIntensity={0.3} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[centre, 0, 12]}>
        <planeGeometry args={[length, 24]} />
        {reflective ? (
          <MeshReflectorMaterial
            color="#040404"
            metalness={0.55}
            roughness={0.85}
            mirror={0.7}
            resolution={512}
            blur={[260, 80]}
            mixBlur={1}
            mixStrength={1.6}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
          />
        ) : (
          <meshStandardMaterial color="#030303" metalness={0.6} roughness={0.22} envMapIntensity={0.6} />
        )}
      </mesh>
    </group>
  );
}
