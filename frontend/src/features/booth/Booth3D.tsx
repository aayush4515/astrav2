import { ContactShadows, Html, OrbitControls, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { DeviceId } from "../../types";
import { BOOTH_DEVICES } from "./devices";

export type BoothPhase = "standby" | "identifying" | "scanning" | "conversation" | "results" | "emergency";

interface BoothProps {
  activeDevice: DeviceId | null;
  phase: BoothPhase;
  selected?: DeviceId | null;
  onSelect?: (id: DeviceId | null) => void;
  interactive?: boolean;
  reduceMotion?: boolean;
  /** 0..1 progress of the active measurement, drives some animations. */
  progress?: number;
}

const HULL = new THREE.MeshStandardMaterial({ color: "#2b3854", metalness: 0.6, roughness: 0.32 });
const HULL_LIGHT = new THREE.MeshStandardMaterial({ color: "#d3dcec", metalness: 0.35, roughness: 0.4 });
const SUIT = new THREE.MeshStandardMaterial({ color: "#eef1f7", metalness: 0.05, roughness: 0.62 });
const SUIT_DARK = new THREE.MeshStandardMaterial({ color: "#7d8aa3", metalness: 0.2, roughness: 0.6 });
const VISOR = new THREE.MeshStandardMaterial({ color: "#0b1530", metalness: 0.9, roughness: 0.1, emissive: "#103050", emissiveIntensity: 0.3 });

export default function Booth3D(props: BoothProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [3.6, 2.3, 4.6], fov: 38 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Interactive 3D health booth"
    >
      <color attach="background" args={["#04070f"]} />
      <fog attach="fog" args={["#04070f", 8, 18]} />
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas>
  );
}

function Scene({ activeDevice, phase, selected, onSelect, interactive = true, reduceMotion, progress = 0 }: BoothProps) {
  const dim = phase === "conversation" || phase === "results" ? 0.45 : phase === "emergency" ? 0.25 : 1;
  const focusId = activeDevice ?? selected ?? null;
  return (
    <>
      <ambientLight intensity={0.3 * dim + 0.1} />
      <hemisphereLight args={["#7fb4ff", "#0a0f1c", 0.5 * dim]} />
      <directionalLight position={[4, 6, 5]} intensity={1.4 * dim} castShadow shadow-mapSize={[1024, 1024]} />
      {/* cool rim light separates the astronaut from the dark shell */}
      <spotLight position={[-2.5, 3.5, -2.5]} angle={0.6} penumbra={0.8} intensity={phase === "emergency" ? 0 : 18 * dim} color="#5ee7ff" distance={9} />
      <Stars radius={70} depth={40} count={2200} factor={3} saturation={0} fade speed={reduceMotion ? 0 : 0.4} />
      <ContactShadows position={[0, 0.125, 0]} opacity={0.55} scale={3} blur={2.4} far={2} resolution={512} />
      <pointLight position={[0, 3.1, 0.6]} intensity={phase === "emergency" ? 0 : 1.2 * dim} color="#5ee7ff" distance={6} />
      {phase === "emergency" && <pointLight position={[0, 3, 1]} intensity={2.5} color="#ff3b3b" distance={7} />}

      <CameraRig focus={focusId ? BOOTH_DEVICES[focusId].focus : null} wide={phase === "conversation" || phase === "results"} reduceMotion={reduceMotion} />
      <OrbitControls
        enabled={interactive}
        enablePan={false}
        autoRotate={phase === "standby" && !reduceMotion && !selected}
        autoRotateSpeed={0.35}
        minDistance={3}
        maxDistance={9}
        minPolarAngle={0.5}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 1.2, 0]}
        makeDefault
      />

      <Structure phase={phase} reduceMotion={reduceMotion} />
      <Astronaut active={activeDevice} reduceMotion={reduceMotion} progress={progress} />

      <DeviceGroup id="face_camera" active={activeDevice} selected={selected} onSelect={onSelect}>
        <FaceCamera active={activeDevice === "face_camera" || phase === "identifying"} reduceMotion={reduceMotion} />
      </DeviceGroup>
      <DeviceGroup id="thermal_module" active={activeDevice} selected={selected} onSelect={onSelect}>
        <ThermalArray active={activeDevice === "thermal_module"} reduceMotion={reduceMotion} />
      </DeviceGroup>
      <DeviceGroup id="wearable_sync" active={activeDevice} selected={selected} onSelect={onSelect}>
        <WearableDock active={activeDevice === "wearable_sync"} reduceMotion={reduceMotion} />
      </DeviceGroup>
      <DeviceGroup id="vitals_module" active={activeDevice} selected={selected} onSelect={onSelect}>
        <VitalsModule active={activeDevice === "vitals_module"} reduceMotion={reduceMotion} />
      </DeviceGroup>
      <DeviceGroup id="mass_module" active={activeDevice} selected={selected} onSelect={onSelect}>
        <MassModule active={activeDevice === "mass_module"} reduceMotion={reduceMotion} />
      </DeviceGroup>
      <DeviceGroup id="e_nose" active={activeDevice} selected={selected} onSelect={onSelect}>
        <ENose active={activeDevice === "e_nose"} reduceMotion={reduceMotion} />
      </DeviceGroup>
      <DeviceGroup id="blood_analyzer" active={activeDevice} selected={selected} onSelect={onSelect}>
        <BloodAnalyzer active={activeDevice === "blood_analyzer"} reduceMotion={reduceMotion} progress={progress} />
      </DeviceGroup>
      <DeviceGroup id="environment" active={activeDevice} selected={selected} onSelect={onSelect}>
        <EnvironmentPanel active={activeDevice === "environment"} />
      </DeviceGroup>
    </>
  );
}

/* ------------------------------------------------------------------ camera */

function CameraRig({ focus, wide, reduceMotion }: { focus: [number, number, number] | null; wide?: boolean; reduceMotion?: boolean }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  const target = useMemo(() => new THREE.Vector3(), []);
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const last = useRef<string>("");
  const animating = useRef(0);
  useFrame((_, dt) => {
    const key = focus ? focus.join(",") : wide ? "wide" : "home";
    if (key !== last.current) {
      last.current = key;
      animating.current = 1.6; // seconds of guided motion; afterwards the user can orbit freely
    }
    if (animating.current <= 0 || !controls) return;
    animating.current -= dt;
    const f = focus ?? [0, 1.2, 0];
    target.set(f[0], f[1], f[2]);
    // Narrow layouts (conversation/results) need more distance to keep the whole booth in frame.
    const dist = focus ? 4.4 : wide ? 8.2 : 6.4;
    const dir = new THREE.Vector3(0.55, 0.28, 1).normalize();
    desiredPos.copy(target).addScaledVector(dir, dist);
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 3);
    controls.target.lerp(target, k);
    camera.position.lerp(desiredPos, k);
    controls.update();
  });
  return null;
}

/* --------------------------------------------------------------- structure */

function Structure({ phase, reduceMotion }: { phase: BoothPhase; reduceMotion?: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current || reduceMotion) return;
    const m = ring.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = phase === "standby" ? 0.6 + Math.sin(clock.elapsedTime * 1.5) * 0.35 : 1.4;
  });
  const accent = phase === "emergency" ? "#ff3b3b" : "#5ee7ff";
  return (
    <group>
      {/* deck */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#070c18" metalness={0.4} roughness={0.8} />
      </mesh>
      <gridHelper args={[12, 24, "#123055", "#0b1a33"]} position={[0, 0.002, 0]} />
      {/* platform */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow material={HULL}>
        <cylinderGeometry args={[1.05, 1.15, 0.12, 64]} />
      </mesh>
      <mesh ref={ring} position={[0, 0.125, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.92, 0.98, 64]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1} toneMapped={false} />
      </mesh>
      {/* curved back shell */}
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.45, 1.45, 2.9, 64, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
        <meshStandardMaterial color="#1c2842" metalness={0.55} roughness={0.38} side={THREE.DoubleSide} />
      </mesh>
      {/* panel seams on the shell */}
      {[0.75, 1.55, 2.35].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, Math.PI * 1.12]}>
          <torusGeometry args={[1.44, 0.006, 6, 64, Math.PI * 0.76]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.25} toneMapped={false} />
        </mesh>
      ))}
      {/* inner light strips */}
      {[-0.95, 0.95].map((x) => (
        <mesh key={x} position={[x, 1.45, -1.02]} rotation-y={x > 0 ? -0.75 : 0.75}>
          <boxGeometry args={[0.015, 2.4, 0.015]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.55} transparent opacity={0.6} toneMapped={false} />
        </mesh>
      ))}
      {/* arch */}
      <mesh position={[0, 2.95, 0]} rotation-x={Math.PI / 2} material={HULL}>
        <torusGeometry args={[1.25, 0.06, 16, 64, Math.PI]} />
      </mesh>
      {/* pillars */}
      {[-1.25, 1.25].map((x) => (
        <mesh key={x} position={[x, 1.48, 0]} castShadow material={HULL}>
          <boxGeometry args={[0.12, 2.95, 0.22]} />
        </mesh>
      ))}
      {/* handrails */}
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 1.05, 0.55]} rotation-z={Math.PI / 2} material={HULL_LIGHT}>
          <capsuleGeometry args={[0.025, 0.3, 4, 12]} />
        </mesh>
      ))}
      {/* foot restraints */}
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.16, 0.12]} rotation-x={Math.PI / 2} material={HULL_LIGHT}>
          <torusGeometry args={[0.1, 0.02, 8, 24, Math.PI]} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- astronaut */

function Astronaut({ active, reduceMotion, progress }: { active: DeviceId | null; reduceMotion?: boolean; progress: number }) {
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!root.current) return;
    const t = clock.elapsedTime;
    // Gentle microgravity sway; the mass device produces a small spring oscillation.
    const mass = active === "mass_module" ? Math.sin(t * 6) * 0.03 * (1 - progress * 0.3) : 0;
    root.current.position.y = reduceMotion ? 0 : Math.sin(t * 0.9) * 0.015 + mass;
    root.current.rotation.y = reduceMotion ? 0 : Math.sin(t * 0.4) * 0.03;
  });
  return (
    <group ref={root}>
      {/* legs */}
      {[-0.12, 0.12].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.55, 0.12]} castShadow material={SUIT}>
            <capsuleGeometry args={[0.085, 0.62, 6, 16]} />
          </mesh>
          <mesh position={[x, 0.2, 0.17]} castShadow material={SUIT_DARK}>
            <boxGeometry args={[0.16, 0.12, 0.28]} />
          </mesh>
        </group>
      ))}
      {/* torso */}
      <mesh position={[0, 1.22, 0.1]} castShadow material={SUIT}>
        <capsuleGeometry args={[0.22, 0.48, 8, 24]} />
      </mesh>
      <mesh position={[0, 1.3, 0.31]} material={SUIT_DARK}>
        <boxGeometry args={[0.2, 0.14, 0.04]} />
      </mesh>
      {/* arms */}
      <mesh position={[-0.33, 1.15, 0.12]} rotation-z={0.12} castShadow material={SUIT}>
        <capsuleGeometry args={[0.065, 0.5, 6, 16]} />
      </mesh>
      <mesh position={[0.33, 1.15, 0.12]} rotation-z={-0.12} castShadow material={SUIT}>
        <capsuleGeometry args={[0.065, 0.5, 6, 16]} />
      </mesh>
      {/* shoulders, hands, life-support pack and collar */}
      {[-0.3, 0.3].map((x) => (
        <mesh key={`s${x}`} position={[x, 1.42, 0.1]} castShadow material={SUIT}>
          <sphereGeometry args={[0.09, 24, 24]} />
        </mesh>
      ))}
      {[-0.365, 0.365].map((x) => (
        <mesh key={`h${x}`} position={[x, 0.83, 0.15]} castShadow material={SUIT_DARK}>
          <sphereGeometry args={[0.05, 16, 16]} />
        </mesh>
      ))}
      <mesh position={[0, 1.24, -0.14]} castShadow material={SUIT_DARK}>
        <boxGeometry args={[0.36, 0.46, 0.14]} />
      </mesh>
      <mesh position={[0, 1.52, 0.1]} rotation-x={Math.PI / 2} material={HULL_LIGHT}>
        <torusGeometry args={[0.1, 0.022, 10, 32]} />
      </mesh>
      {/* chest status light mirrors the booth state */}
      <mesh position={[0.07, 1.31, 0.335]}>
        <circleGeometry args={[0.016, 16]} />
        <meshStandardMaterial color="#5ee7ff" emissive="#5ee7ff" emissiveIntensity={active ? 2.5 : 0.8} toneMapped={false} />
      </mesh>
      {/* head + visor-less face plate (booth is shirt-sleeve environment) */}
      <mesh position={[0, 1.66, 0.1]} castShadow material={SUIT}>
        <sphereGeometry args={[0.15, 32, 32]} />
      </mesh>
      <mesh position={[0, 1.67, 0.21]} material={VISOR}>
        <sphereGeometry args={[0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
      </mesh>
      <mesh position={[0, 1.5, 0.1]} material={SUIT_DARK}>
        <cylinderGeometry args={[0.06, 0.07, 0.08, 16]} />
      </mesh>
      {/* wrist wearable */}
      <mesh position={[-0.37, 0.88, 0.14]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.07, 0.018, 8, 24]} />
        <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={active === "wearable_sync" ? 2 : 0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ devices */

function DeviceGroup({ id, active, selected, onSelect, children }: { id: DeviceId; active: DeviceId | null; selected?: DeviceId | null; onSelect?: (id: DeviceId | null) => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const dev = BOOTH_DEVICES[id];
  const isActive = active === id;
  const isSel = selected === id;
  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(isSel ? null : id);
      }}
    >
      {children}
      {(hover || isActive || isSel) && (
        <Html position={dev.focus} center style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
          <div
            className="whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest backdrop-blur"
            style={{ borderColor: `${dev.color}88`, color: dev.color, background: "rgba(4,7,15,0.7)", transform: "translateY(-38px)" }}
          >
            {isActive ? "● " : ""}
            {dev.short}
          </div>
        </Html>
      )}
    </group>
  );
}

function Glow({ color, active, intensity = 2.2 }: { color: string; active: boolean; intensity?: number }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? intensity : 0.35} toneMapped={false} />;
}

function FaceCamera({ active, reduceMotion }: { active: boolean; reduceMotion?: boolean }) {
  const scan = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!scan.current) return;
    scan.current.visible = active;
    if (!reduceMotion) scan.current.position.y = 1.66 + Math.sin(clock.elapsedTime * 2.4) * 0.14;
  });
  const color = BOOTH_DEVICES.face_camera.color;
  return (
    <group>
      <mesh position={[0, 2.82, 0.42]} rotation-x={0.5} material={HULL}>
        <boxGeometry args={[0.36, 0.14, 0.16]} />
      </mesh>
      <mesh position={[0, 2.78, 0.5]} rotation-x={Math.PI / 2 + 0.5}>
        <cylinderGeometry args={[0.045, 0.045, 0.04, 24]} />
        <Glow color={color} active={active} />
      </mesh>
      <mesh position={[0, 2.86, 0.32]} rotation-x={0.5} material={HULL}>
        <boxGeometry args={[0.06, 0.3, 0.06]} />
      </mesh>
      {/* scan plane */}
      <mesh ref={scan} position={[0, 1.66, 0.3]}>
        <planeGeometry args={[0.5, 0.012]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      {active && (
        <mesh position={[0, 2.2, 0.38]} rotation-x={Math.PI + 0.42}>
          <coneGeometry args={[0.32, 1.25, 32, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.07} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function ThermalArray({ active, reduceMotion }: { active: boolean; reduceMotion?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reduceMotion) return;
    ref.current.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m?.emissive) m.emissiveIntensity = active ? 1 + Math.sin(clock.elapsedTime * 5 + i) * 0.9 : 0.25;
    });
  });
  const color = BOOTH_DEVICES.thermal_module.color;
  return (
    <group position={[1.12, 1.6, 0.25]} rotation-y={-1.0}>
      <mesh material={HULL}>
        <boxGeometry args={[0.34, 0.42, 0.06]} />
      </mesh>
      <group ref={ref} position={[0, 0, 0.035]}>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={i} position={[((i % 3) - 1) * 0.09, (Math.floor(i / 3) - 1.5) * 0.085, 0]}>
            <boxGeometry args={[0.06, 0.06, 0.01]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {active && (
        <mesh position={[-0.55, 0.05, 0.25]} rotation-z={Math.PI / 2} rotation-y={0.3}>
          <coneGeometry args={[0.2, 1.0, 24, 1, true]} />
          <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function DataStream({ from, to, color, active, count = 18 }: { from: THREE.Vector3; to: THREE.Vector3; color: string; active: boolean; count?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.visible = active;
    if (!active) return;
    for (let i = 0; i < count; i++) {
      const p = (clock.elapsedTime * 0.6 + i / count) % 1;
      tmp.position.lerpVectors(from, to, p);
      tmp.position.y += Math.sin(p * Math.PI) * 0.15;
      tmp.scale.setScalar(0.6 + Math.sin(p * Math.PI) * 0.8);
      tmp.updateMatrix();
      ref.current.setMatrixAt(i, tmp.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.012, 8, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </instancedMesh>
  );
}

function WearableDock({ active }: { active: boolean; reduceMotion?: boolean }) {
  const color = BOOTH_DEVICES.wearable_sync.color;
  return (
    <group>
      <mesh position={[-1.12, 1.0, 0.18]} rotation-y={1.0} material={HULL}>
        <boxGeometry args={[0.26, 0.2, 0.06]} />
      </mesh>
      <mesh position={[-1.09, 1.0, 0.21]} rotation-y={1.0}>
        <circleGeometry args={[0.06, 32]} />
        <Glow color={color} active={active} />
      </mesh>
      <DataStream from={new THREE.Vector3(-0.37, 0.88, 0.16)} to={new THREE.Vector3(-1.07, 1.0, 0.22)} color={color} active={active} />
    </group>
  );
}

function VitalsModule({ active, reduceMotion }: { active: boolean; reduceMotion?: boolean }) {
  const cuff = useRef<THREE.Mesh>(null);
  const color = BOOTH_DEVICES.vitals_module.color;
  useFrame(({ clock }) => {
    if (!cuff.current) return;
    const s = active && !reduceMotion ? 1 + (Math.sin(clock.elapsedTime * 1.4) * 0.5 + 0.5) * 0.35 : 1;
    cuff.current.scale.set(s, 1, s);
  });
  return (
    <group>
      <mesh ref={cuff} position={[0.34, 1.28, 0.12]} rotation-z={-0.12}>
        <cylinderGeometry args={[0.085, 0.085, 0.16, 24]} />
        <meshStandardMaterial color="#26334f" emissive={color} emissiveIntensity={active ? 0.5 : 0.05} />
      </mesh>
      {/* pulse oximeter clip on right hand */}
      <mesh position={[0.38, 0.86, 0.16]}>
        <boxGeometry args={[0.06, 0.05, 0.06]} />
        <Glow color={color} active={active} />
      </mesh>
      {/* tube to the module */}
      <mesh position={[0.75, 1.2, 0.12]} rotation-z={Math.PI / 2.3} material={SUIT_DARK}>
        <cylinderGeometry args={[0.008, 0.008, 0.85, 8]} />
      </mesh>
      <mesh position={[1.12, 1.15, 0.2]} rotation-y={-1.0} material={HULL}>
        <boxGeometry args={[0.3, 0.24, 0.08]} />
      </mesh>
      <mesh position={[1.08, 1.17, 0.25]} rotation-y={-1.0}>
        <planeGeometry args={[0.22, 0.12]} />
        <Glow color={color} active={active} intensity={1.2} />
      </mesh>
    </group>
  );
}

function MassModule({ active, reduceMotion }: { active: boolean; reduceMotion?: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const color = BOOTH_DEVICES.mass_module.color;
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const m = ring.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = active ? 1.5 + (reduceMotion ? 0 : Math.sin(clock.elapsedTime * 8) * 0.8) : 0.2;
  });
  return (
    <group>
      <mesh ref={ring} position={[0, 0.135, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.45, 0.6, 48]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      {/* spring arms */}
      {[-0.68, 0.68].map((x) => (
        <group key={x} position={[x, 0.32, -0.2]}>
          <mesh material={HULL_LIGHT}>
            <boxGeometry args={[0.06, 0.4, 0.06]} />
          </mesh>
          <mesh position={[0, 0.22, 0.12]} rotation-x={Math.PI / 2} material={HULL}>
            <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ENose({ active }: { active: boolean; reduceMotion?: boolean }) {
  const color = BOOTH_DEVICES.e_nose.color;
  return (
    <group>
      <mesh position={[-0.78, 1.0, 0.42]} rotation-y={0.6} material={HULL}>
        <boxGeometry args={[0.22, 0.16, 0.14]} />
      </mesh>
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh key={i} position={[-0.72 + i * 0.0, 1.0 - 0.045 + i * 0.03, 0.5]} rotation-y={0.6}>
          <boxGeometry args={[0.12, 0.008, 0.01]} />
          <Glow color={color} active={active} intensity={1.6} />
        </mesh>
      ))}
      <DataStream from={new THREE.Vector3(-0.38, 0.95, 0.2)} to={new THREE.Vector3(-0.72, 1.0, 0.47)} color={color} active={active} count={24} />
    </group>
  );
}

function BloodAnalyzer({ active, reduceMotion, progress }: { active: boolean; reduceMotion?: boolean; progress: number }) {
  const rotor = useRef<THREE.Mesh>(null);
  const cart = useRef<THREE.Mesh>(null);
  const color = BOOTH_DEVICES.blood_analyzer.color;
  useFrame((_, dt) => {
    if (rotor.current && active && !reduceMotion) rotor.current.rotation.y += dt * 9;
    if (cart.current) cart.current.position.x = THREE.MathUtils.lerp(cart.current.position.x, active ? 0.0 : 0.22, 0.05);
  });
  return (
    <group position={[1.25, 0.9, 0.45]} rotation-y={-0.8}>
      {/* shelf */}
      <mesh position={[0, -0.08, 0]} material={HULL}>
        <boxGeometry args={[0.55, 0.04, 0.35]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={HULL_LIGHT}>
        <boxGeometry args={[0.34, 0.24, 0.26]} />
      </mesh>
      <mesh position={[0, 0.1, 0.132]}>
        <planeGeometry args={[0.22, 0.09]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.8 + progress : 0.15} toneMapped={false} />
      </mesh>
      <mesh ref={rotor} position={[0, 0.19, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.02, 24]} />
        <meshStandardMaterial color="#334" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh ref={cart} position={[0.22, 0.0, 0.1]}>
        <boxGeometry args={[0.1, 0.02, 0.05]} />
        <Glow color={color} active={active} />
      </mesh>
    </group>
  );
}

function EnvironmentPanel({ active }: { active: boolean }) {
  const color = BOOTH_DEVICES.environment.color;
  return (
    <group position={[-1.05, 2.0, -0.55]} rotation-y={0.85}>
      <mesh material={HULL}>
        <boxGeometry args={[0.36, 0.3, 0.04]} />
      </mesh>
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[-0.12 + i * 0.06, 0.02, 0.025]}>
          <circleGeometry args={[0.018, 16]} />
          <Glow color={i === 0 ? "#4ade80" : color} active={active || i === 0} intensity={1.4} />
        </mesh>
      ))}
    </group>
  );
}
