import { Suspense, useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Html, OrbitControls, useAnimations, useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { STATUS_COLOR, type Status } from "@/lib/utils"

export interface Zone { id: string; label: string; bone: string; offset: [number, number, number]; status: Status }

const HOLO = new THREE.Color("#5cc8ff")

/** Fresnel rim + drifting scanlines injected into a standard material, so GPU skinning keeps working. */
function hologramMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: "#081a2c", transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, roughness: 1, metalness: 0 })
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = { value: 0 }
    s.uniforms.uHolo = { value: HOLO }
    m.userData.shader = s
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying float vY;")
      .replace("#include <skinning_vertex>", "#include <skinning_vertex>\nvY = (modelMatrix * vec4(transformed, 1.0)).y;")
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uTime; uniform vec3 uHolo; varying float vY;")
      .replace("#include <dithering_fragment>", `
        float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
        float scan = 0.5 + 0.5 * sin(vY * 220.0 - uTime * 3.0);
        float sweep = smoothstep(0.06, 0.0, abs(fract(vY * 0.35 - uTime * 0.12) - 0.5));
        gl_FragColor.rgb = uHolo * (0.10 + fr * 1.35 + scan * 0.05 + sweep * 0.35);
        gl_FragColor.a = clamp(0.05 + fr * 0.85 + sweep * 0.25, 0.0, 1.0);
        #include <dithering_fragment>`)
  }
  return m
}

function Body({ zones, selected, onSelect }: { zones: Zone[]; selected?: string; onSelect?: (id: string) => void }) {
  const { scene, animations } = useGLTF("/models/body.glb")
  const root = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, root)
  const mat = useMemo(hologramMaterial, [])
  const markers = useRef<Record<string, THREE.Group | null>>({})

  useEffect(() => {
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).material = mat; o.frustumCulled = false } })
    actions.idle?.reset().fadeIn(0.4).play()
  }, [scene, mat, actions])

  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const sh = mat.userData.shader
    if (sh) sh.uniforms.uTime.value = clock.elapsedTime
    for (const z of zones) {
      const bone = scene.getObjectByName(z.bone.replace(/[:.\[\]/]/g, "")), g = markers.current[z.id]
      if (!bone || !g) continue
      bone.getWorldPosition(v)
      g.position.set(v.x + z.offset[0], v.y + z.offset[1], v.z + z.offset[2])
      const s = 1 + 0.25 * Math.sin(clock.elapsedTime * (z.status === "alert" ? 5 : 2))
      g.children[1]?.scale.setScalar(s)
    }
  })

  return (
    <group ref={root}>
      <primitive object={scene} />
      {zones.map((z) => {
        const c = STATUS_COLOR[z.status], active = selected === z.id
        return (
          <group key={z.id} ref={(el) => { markers.current[z.id] = el }}>
            <mesh onClick={(e) => { e.stopPropagation(); onSelect?.(z.id) }}
              onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
              <sphereGeometry args={[active ? 0.045 : 0.032, 20, 20]} />
              <meshBasicMaterial color={c} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.07, 20, 20]} />
              <meshBasicMaterial color={c} transparent opacity={z.status === "ok" ? 0.12 : 0.28} depthWrite={false}
                blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
            {active && (
              <Html center distanceFactor={2.6} position={[0.36, 0.06, 0]} style={{ pointerEvents: "none" }}>
                <div className="label whitespace-nowrap border-l pl-2" style={{ borderColor: c, color: c }}>{z.label}</div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

function Projector() {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.15 })
  return (
    <group ref={ref} rotation-x={-Math.PI / 2} position-y={0.005}>
      {[0.42, 0.55, 0.72].map((r, i) => (
        <mesh key={r}>
          <ringGeometry args={[r, r + (i === 1 ? 0.012 : 0.004), 96, 1, 0, i === 2 ? Math.PI * 1.6 : Math.PI * 2]} />
          <meshBasicMaterial color={HOLO} transparent opacity={0.35 - i * 0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

export default function HoloBody({ zones, selected, onSelect, interactive = true, className }:
  { zones: Zone[]; selected?: string; onSelect?: (id: string) => void; interactive?: boolean; className?: string }) {
  return (
    <div className={className} role="img" aria-label="Interactive 3D body model. Highlighted points show the status of each body system.">
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.98, 3.9], fov: 34 }} gl={{ antialias: true, alpha: true }}>
        <Suspense fallback={null}>
          <Body zones={zones} selected={selected} onSelect={onSelect} />
          <Projector />
        </Suspense>
        <OrbitControls target={[0, 0.88, 0]} enablePan={false} enableZoom={false} enableRotate={interactive}
          minPolarAngle={Math.PI / 2.6} maxPolarAngle={Math.PI / 1.9} rotateSpeed={0.6} />
      </Canvas>
    </div>
  )
}

useGLTF.preload("/models/body.glb")
