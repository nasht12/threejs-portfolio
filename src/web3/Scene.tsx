import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import { easing } from 'maath';
import interUrl from '@fontsource/inter/files/inter-latin-500-normal.woff?url';
import { CATEGORY } from './decode';
import { CAMERA, chainPos, CHAIN, POOL, poolPos, PRIVATE, SLAB, tileGrid, tileLocal, tipHeight } from './layout';
import { pool, LOW } from './feed';
import { useWeb3, type BlockView } from './store';

const BG = '#f2f1ee';
const PENDING = new THREE.Color('#8f8d86');
const DIM = new THREE.Color(BG);
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
 * Rules, as in the gallery: no React state per frame (per-frame values live in refs and plain modules), nothing
 * allocated in useFrame, instanced meshes for anything counted in the hundreds.
 */

export function Web3Canvas() {
  return (
    <Canvas
      flat
      dpr={LOW ? 1 : [1, 1.75]}
      camera={{ position: [...CAMERA.position], fov: CAMERA.fov, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => useWeb3.getState().setHover(null)}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 24, 52]} />
      <hemisphereLight args={['#ffffff', '#cfcac0', 1.5]} />
      <directionalLight position={[5, 11, 7]} intensity={1.7} />
      <Grid position={[0, -0.11, 0]} infiniteGrid cellSize={0.55} sectionSize={2.75} cellThickness={0.6} sectionThickness={0.9}
        cellColor="#e2dfd8" sectionColor="#d3cfc6" fadeDistance={42} fadeStrength={1.6} />
      <PendingPool />
      <Chain />
      <Flights />
      <PrivateRelay />
      <FitWidth />
      <OrbitControls target={[...CAMERA.target]} enablePan={false} enableDamping minDistance={9} maxDistance={30}
        minPolarAngle={0.55} maxPolarAngle={1.28} minAzimuthAngle={-0.6} maxAzimuthAngle={0.6} />
    </Canvas>
  );
}

/** Keep the pool and the newest block in frame on any shape of screen: hold a minimum horizontal field of view. */
function FitWidth() {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree(s => s.size.width / s.size.height);
  useEffect(() => {
    const minH = THREE.MathUtils.degToRad(50);
    camera.fov = Math.max(CAMERA.fov, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / aspect)));
    camera.updateProjectionMatrix();
  }, [camera, aspect]);
  return null;
}

// ---- the public mempool ---------------------------------------------------------------------------------------

function PendingPool() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const at = useMemo<[number, number, number]>(() => [0, 0, 0], []);
  const count = useWeb3(s => s.pending.count);

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now(), t = now / 1000, a = m.instanceMatrix.array as Float32Array;
    for (let i = 0; i < pool.capacity; i++) {
      const p = pool.slots[i], o = i * 16;
      const s = p ? Math.min(1, (now - p.seen) / 450) : 0;
      if (p) poolPos(i, (now - p.seen) / 1000, t, at);
      a[o] = s; a[o + 5] = s; a[o + 10] = s;
      a[o + 12] = p ? at[0] : 0; a[o + 13] = p ? at[1] : -10; a[o + 14] = p ? at[2] : 0; a[o + 15] = 1;
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, pool.capacity]} frustumCulled={false}>
        <octahedronGeometry args={[0.065, 0]} />
        <meshStandardMaterial color={PENDING} roughness={0.6} />
      </instancedMesh>
      <mesh position={[POOL.x, -0.1, POOL.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, POOL.squash, 1]}>
        <ringGeometry args={[POOL.rim + 0.32, POOL.rim + 0.36, 96]} />
        <meshBasicMaterial color="#c9c4b9" />
      </mesh>
      <Label position={[POOL.x, -0.09, POOL.z + POOL.rim * POOL.squash + 0.8]} size={0.3}>PUBLIC MEMPOOL</Label>
      <Label position={[POOL.x, -0.09, POOL.z + POOL.rim * POOL.squash + 1.25]} size={0.22} color="#6f6d66">
        {`${count.toLocaleString('en-US')} pending, as seen by one node`}
      </Label>
    </group>
  );
}

function PrivateRelay() {
  return (
    <group>
      <mesh position={[PRIVATE.x, PRIVATE.y, PRIVATE.z]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#3d3b36" />
      </mesh>
      <mesh position={[PRIVATE.x, PRIVATE.y / 2 + 0.6, PRIVATE.z]}>
        <cylinderGeometry args={[0.008, 0.008, PRIVATE.y - 1.2, 4]} />
        <meshBasicMaterial color="#cbc6bb" />
      </mesh>
      <Text font={interUrl} position={[PRIVATE.x - 0.35, PRIVATE.y, PRIVATE.z]} fontSize={0.24} color="#3d3b36" anchorX="right" anchorY="middle">
        PRIVATE ORDER FLOW
      </Text>
    </group>
  );
}

function Label({ children, position, size, color = '#2b2a27' }: { children: string; position: [number, number, number]; size: number; color?: string }) {
  return (
    <Text font={interUrl} position={position} rotation={[-Math.PI / 2, 0, 0]} fontSize={size} color={color} anchorX="center" anchorY="middle" letterSpacing={0.04}>
      {children}
    </Text>
  );
}

// ---- the chain ------------------------------------------------------------------------------------------------

function Chain() {
  const blocks = useWeb3(s => s.blocks);
  return <>{blocks.slice(0, CHAIN.keep).map((b, rank) => <BlockSlab key={b.hash} block={b} rank={rank} />)}</>;
}

/** Where a flight ends and a tile grows from: per block, filled in when the block first appears. */
const FLIGHT = { spread: 1400, public: 1000, private: 750 };

function BlockSlab({ block, rank }: { block: BlockView; rank: number }) {
  const group = useRef<THREE.Group>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const n = block.txs.length;
  const { cols, cell, size } = useMemo(() => tileGrid(n), [n]);
  const focus = useWeb3(s => s.focus);
  const sel = useWeb3(s => (s.selected.block === block.number ? s.selected.tx : null));
  const hover = useWeb3(s => (s.hover?.block === block.number ? s.hover.tx : null));
  const target = useMemo(() => new THREE.Vector3(...chainPos(rank)), [rank]);

  // per tile: local position, height, and when it lands
  const layout = useMemo(() => {
    const still = reduceMotion() || performance.now() - block.arrivedAt > 2500;
    const pos = new Float32Array(n * 2), h = new Float32Array(n), land = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const [x, z] = tileLocal(i, cols, cell);
      pos[i * 2] = x; pos[i * 2 + 1] = z;
      h[i] = tipHeight(block.tips[i] / 1e9);
      const isPrivate = Number.isNaN(block.origins[i * 3]);
      land[i] = still ? 0 : block.arrivedAt + (i / Math.max(1, n)) * FLIGHT.spread + (isPrivate ? FLIGHT.private : FLIGHT.public);
    }
    return { pos, h, land, still };
  }, [block, n, cols, cell]);

  // launch this block's flights once, from the pool (or the private relay) to the tiles at the front of the chain
  useEffect(() => {
    if (layout.still) return;
    const [bx, , bz] = chainPos(0);
    for (let i = 0; i < n; i++) {
      const ox = block.origins[i * 3], isPrivate = Number.isNaN(ox);
      const jitter = isPrivate ? (i % 7) * 0.05 - 0.15 : 0;
      flights.push({
        sx: isPrivate ? PRIVATE.x + jitter : ox, sy: isPrivate ? PRIVATE.y : block.origins[i * 3 + 1], sz: isPrivate ? PRIVATE.z + jitter : block.origins[i * 3 + 2],
        ex: bx + layout.pos[i * 2], ey: layout.h[i] + 0.1, ez: bz + layout.pos[i * 2 + 1],
        t0: layout.land[i] - (isPrivate ? FLIGHT.private : FLIGHT.public), dur: isPrivate ? FLIGHT.private : FLIGHT.public,
        color: new THREE.Color(CATEGORY[block.info[i].category].color), arc: !isPrivate,
      });
    }
  }, [block, n, layout]);

  // colours: category, dimmed when the legend highlights something else
  useEffect(() => {
    const m = tiles.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.set(CATEGORY[block.info[i].category].color);
      const dim = focus === 'private' ? block.seenFor[i] !== null : focus !== null && block.info[i].category !== focus;
      if (dim) c.lerp(DIM, 0.8);
      m.setColorAt(i, c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [block, n, focus]);

  const settled = useRef(false);
  const placed = useRef(false);
  useFrame((_, dt) => {
    const g = group.current, m = tiles.current;
    if (!g || !m) return;
    if (!placed.current) { g.position.copy(target); placed.current = true; }   // new blocks appear in place; older ones slide back
    easing.damp3(g.position, target, reduceMotion() ? 0 : 0.35, dt);
    if (settled.current) return;
    const now = performance.now(), a = m.instanceMatrix.array as Float32Array;
    let done = true;
    for (let i = 0; i < n; i++) {
      const grow = layout.land[i] === 0 ? 1 : Math.min(1, Math.max(0, (now - layout.land[i]) / 220));
      if (grow < 1) done = false;
      const o = i * 16, sy = layout.h[i] * grow;
      a[o] = grow > 0 ? size : 0; a[o + 5] = Math.max(sy, 1e-4); a[o + 10] = grow > 0 ? size : 0;
      a[o + 12] = layout.pos[i * 2]; a[o + 13] = 0; a[o + 14] = layout.pos[i * 2 + 1]; a[o + 15] = 1;
    }
    m.instanceMatrix.needsUpdate = true;
    if (done) { settled.current = true; m.computeBoundingSphere(); m.computeBoundingBox(); }
  });

  const store = useWeb3.getState;
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    store().setHover({ block: block.number, tx: e.instanceId, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) store().selectTx(block.number, e.instanceId);
  };

  const marker = (i: number | null, color: string, pad: number) => i !== null && i < n && (
    <mesh position={[layout.pos[i * 2], layout.h[i] / 2, layout.pos[i * 2 + 1]]} scale={[size + pad, layout.h[i] + pad, size + pad]}>
      <boxGeometry />
      <meshBasicMaterial color={color} wireframe />
    </mesh>
  );

  return (
    <group ref={group}>
      <mesh position={[0, -0.06, 0]} onClick={e => { e.stopPropagation(); store().selectBlock(block.number); }}>
        <boxGeometry args={[SLAB + 0.24, 0.1, SLAB + 0.24]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </mesh>
      <instancedMesh ref={tiles} args={[undefined, undefined, Math.max(1, n)]} frustumCulled={false}
        onPointerMove={onMove} onPointerOut={() => store().setHover(null)} onClick={onClick}>
        <boxGeometry args={[1, 1, 1]} onUpdate={g => g.translate(0, 0.5, 0)} />
        <meshStandardMaterial roughness={0.55} />
      </instancedMesh>
      {marker(hover, '#6f6d66', 0.05)}
      {marker(sel, '#111111', 0.09)}
      <Label position={[0, -0.09, SLAB / 2 + 0.45]} size={0.3}>{`#${block.number.toLocaleString('en-US')}`}</Label>
      {block.builder && <Label position={[0, -0.09, SLAB / 2 + 0.86]} size={0.2} color="#6f6d66">{block.builder}</Label>}
    </group>
  );
}

// ---- transactions in flight -----------------------------------------------------------------------------------

interface Flight { sx: number; sy: number; sz: number; ex: number; ey: number; ez: number; t0: number; dur: number; color: THREE.Color; arc: boolean }
const flights: Flight[] = [];
const MAX_FLIGHTS = 1600;

function Flights() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const now = performance.now(), a = m.instanceMatrix.array as Float32Array;
    let k = 0;
    for (let i = flights.length - 1; i >= 0; i--) if (now > flights[i].t0 + flights[i].dur) flights.splice(i, 1);
    for (const f of flights) {
      if (k >= MAX_FLIGHTS) break;
      const u = (now - f.t0) / f.dur;
      if (u < 0) continue;
      const e = f.arc ? u * u * (3 - 2 * u) : u * u;          // public: an arc out of the pool; private: a drop
      const o = k * 16, s = 0.11;
      a[o] = s; a[o + 5] = s; a[o + 10] = s; a[o + 15] = 1;
      a[o + 12] = f.sx + (f.ex - f.sx) * e;
      a[o + 13] = f.sy + (f.ey - f.sy) * e + (f.arc ? Math.sin(Math.PI * u) * 2.2 : 0);
      a[o + 14] = f.sz + (f.ez - f.sz) * e;
      m.setColorAt(k, c.copy(PENDING).lerp(f.color, Math.min(1, u * 1.6)));
      k++;
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_FLIGHTS]} frustumCulled={false}
      onUpdate={m => { m.setColorAt(0, PENDING); m.count = 0; }}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.5} />
    </instancedMesh>
  );
}
