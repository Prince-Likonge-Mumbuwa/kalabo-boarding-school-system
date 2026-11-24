// @/components/superadmin/UsageChart3D.tsx — the Overview banner's 3D chart:
// one bar per AI tool, its height the tool's use, on a slowly turning
// platform. Loaded on its own (React.lazy), so three.js is downloaded only
// when the superAdmin opens the console, never by teachers.
//
// Kind to the device: it stops drawing while the tab is hidden, and with
// "reduce motion" it does not turn (it is drawn once, still).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';

export interface Bar3D { key: string; label: string; value: number; color: string }

function Bars({ bars, spin }: { bars: Bar3D[]; spin: boolean }) {
  const group = useRef<Group>(null);
  const meshes = useRef<(Mesh | null)[]>([]);
  const grown = useRef(0);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const gap = 1.15;
  const start = -((bars.length - 1) * gap) / 2;
  const radius = ((bars.length - 1) * gap) / 2 + 0.95;

  useFrame((_, delta) => {
    if (group.current && spin) group.current.rotation.y += delta * 0.18;
    // Bars grow from the floor when the chart first appears.
    if (grown.current < 1) {
      grown.current = spin ? Math.min(1, grown.current + delta * 1.2) : 1;
      const e = 1 - (1 - grown.current) ** 3;
      meshes.current.forEach((m, i) => {
        if (!m) return;
        const h = Math.max(0.12, (bars[i].value / max) * 3.2) * e;
        m.scale.y = Math.max(0.001, h);
        m.position.y = (h / 2);
      });
    }
  });

  return (
    <group ref={group} rotation={[0, -0.5, 0]}>
      {/* Platform */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[radius, 64]} />
        <meshStandardMaterial color="#1d3f72" metalness={0.2} roughness={0.6} transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <ringGeometry args={[radius - 0.05, radius + 0.06, 64]} />
        <meshBasicMaterial color="#5bb4dd" />
      </mesh>
      {bars.map((b, i) => (
        <mesh key={b.key} ref={(m) => { meshes.current[i] = m; }} position={[start + i * gap, 0.001, 0]} castShadow>
          <boxGeometry args={[0.7, 1, 0.7]} />
          <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.35} metalness={0.25} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

export default function UsageChart3D({ bars, still }: { bars: Bar3D[]; still: boolean }) {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const spin = !still;
  // Moving: draw every frame while the tab is visible. Still: draw only when needed.
  const frameloop = !visible ? 'never' : spin ? 'always' : 'demand';
  const label = useMemo(() => `3D chart of AI use per tool: ${bars.map((b) => `${b.label} ${b.value}`).join(', ')}.`, [bars]);

  return (
    <div role="img" aria-label={label} className="h-full w-full">
      <Canvas
        frameloop={frameloop}
        dpr={[1, 1.75]}
        shadows
        camera={{ position: [0, 4.6, 9.6], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        onCreated={({ camera }) => camera.lookAt(0, 0.85, 0)}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[4, 7, 5]} intensity={1.3} castShadow shadow-mapSize={[512, 512]} />
        <pointLight position={[-4, 3, -2]} intensity={18} color="#5bb4dd" />
        <Bars bars={bars} spin={spin} />
      </Canvas>
    </div>
  );
}
