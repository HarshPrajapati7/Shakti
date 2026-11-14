import { Suspense, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { COLOR, MODEL_URL, type Status } from "@/lib/utils"

export interface Zone { id: string; label: string; status: Status }

const H = 1.75
// body-system anchors: [fraction of body height, sideways offset in m]; projected onto the skin by raycasting
const ANCHOR: Record<string, [number, number]> = {
  brain: [0.965, 0], eyes: [0.925, 0.032], mind: [0.865, 0], heart: [0.725, 0.045], lungs: [0.745, -0.085],
  metabolic: [0.6, 0], muscle: [0.3, 0.1], radiation: [0.81, -0.17],
}
const BLUE = new THREE.Color("#8ea0c4")
// size of the glowing region per body system (m)
const RADIUS: Record<string, number> = { brain: 0.13, eyes: 0.07, mind: 0.09, heart: 0.13, lungs: 0.17, metabolic: 0.17, muscle: 0.32, radiation: 0.2 }

function holoMaterial(map: THREE.Texture | null) {
  const m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  m.onBeforeCompile = (s) => {
    s.uniforms.uT = { value: 0 }; s.uniforms.uC = { value: BLUE }; s.uniforms.uN = { value: 0 }
    s.uniforms.uP = { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }; s.uniforms.uK = { value: Array.from({ length: 8 }, () => new THREE.Color()) }
    m.userData.s = s
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vY = vW.y; vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz);")
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uT; uniform vec3 uC; uniform int uN; uniform vec4 uP[8]; uniform vec3 uK[8]; varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW;")
      .replace("#include <dithering_fragment>", `
        float wire = clamp((0.62 - dot(diffuseColor.rgb, vec3(0.333))) * 3.0, 0.0, 1.0);
        float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float sweep = smoothstep(0.04, 0.0, abs(fract(vY * 0.28 - uT * 0.08) - 0.5));
        float a = clamp(0.03 + wire * 0.75 + fr * 0.55 + sweep * 0.35, 0.0, 1.0);
        vec3 col = uC * (0.15 + wire * 1.1 + fr * 0.9 + sweep * 0.8);
        for (int i = 0; i < 8; i++) { if (i >= uN) break;
          float d = distance(vW, uP[i].xyz), w = smoothstep(uP[i].w, uP[i].w * 0.35, d) * (0.75 + 0.25 * sin(uT * 3.0));
          col = mix(col, uK[i] * (0.6 + wire * 1.6 + fr), w); a = max(a, w * (0.35 + wire * 0.6)); }
        gl_FragColor = vec4(col, a);
        #include <dithering_fragment>`)
  }
  return m
}

function Body({ zones, selected, onSelect }: { zones: Zone[]; selected?: string; onSelect: (id: string) => void }) {
  const { scene } = useGLTF(MODEL_URL)
  const model = useMemo(() => { const g = new THREE.Group(); g.add(scene.clone(true)); return g }, [scene])
  const mats = useRef<THREE.Material[]>([])
  const [pts, setPts] = useState<Record<string, THREE.Vector3>>({})
  const halos = useRef<Record<string, THREE.Mesh | null>>({})

  useLayoutEffect(() => {
    mats.current = []
    model.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mat = holoMaterial((m.material as THREE.MeshStandardMaterial).map ?? null)
      m.material = mat; mats.current.push(mat); m.frustumCulled = false
    })
    // normalise on a wrapper so the file's own node transforms are kept: stand it up, 1.75 m tall, feet on the floor
    model.rotation.set(0, 0, 0); model.scale.setScalar(1); model.position.set(0, 0, 0) // idempotent on re-mount
    model.updateMatrixWorld(true)
    let s = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
    if (s.z > s.y * 1.5) model.rotation.x = -Math.PI / 2
    else if (s.x > s.y * 1.5) model.rotation.z = Math.PI / 2
    model.updateMatrixWorld(true)
    s = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
    model.scale.setScalar(H / s.y); model.updateMatrixWorld(true)
    const b2 = new THREE.Box3().setFromObject(model)
    model.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2); model.updateMatrixWorld(true)
    const ray = new THREE.Raycaster(), out: Record<string, THREE.Vector3> = {}
    for (const [id, [fy, x]] of Object.entries(ANCHOR)) {
      ray.set(new THREE.Vector3(x, fy * H, 3), new THREE.Vector3(0, 0, -1))
      const hit = ray.intersectObject(model, true)[0]
      out[id] = new THREE.Vector3(x, fy * H, hit ? hit.point.z + 0.015 : 0.12)
    }
    setPts(out)
  }, [model])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const bad = zones.filter((z) => z.status !== "ok" && pts[z.id]).slice(0, 8)
    for (const m of mats.current) {
      const u = m.userData.s?.uniforms; if (!u) continue
      u.uT.value = t; u.uN.value = bad.length
      bad.forEach((z, i) => { const p = pts[z.id]; u.uP.value[i].set(p.x, p.y, p.z - 0.06, RADIUS[z.id] ?? 0.14); u.uK.value[i].set(COLOR[z.status]) })
    }
    for (const z of zones) halos.current[z.id]?.scale.setScalar(1 + 0.4 * Math.abs(Math.sin(t * (z.status === "alert" ? 3.5 : 1.4))))
  })

  return (
    <group>
      <primitive object={model} />
      {zones.filter((z) => pts[z.id]).map((z) => (
        <group key={z.id} position={pts[z.id]}>
          <mesh onClick={(e) => { e.stopPropagation(); onSelect(z.id) }} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
            <sphereGeometry args={[selected === z.id ? 0.03 : 0.021, 16, 16]} /><meshBasicMaterial color={COLOR[z.status]} toneMapped={false} />
          </mesh>
          <mesh ref={(e) => { halos.current[z.id] = e }}><sphereGeometry args={[0.048, 16, 16]} />
            <meshBasicMaterial color={COLOR[z.status]} transparent opacity={z.status === "ok" ? 0.12 : 0.32} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
        </group>
      ))}
    </group>
  )
}

function Base() {
  const g = useRef<THREE.Group>(null)
  useFrame((_, d) => { if (g.current) g.current.rotation.z += d * 0.15 })
  return (
    <group rotation-x={-Math.PI / 2} position-y={0.005}>
      <group ref={g}>
        {([[0.36, 0.005, 2], [0.44, 0.0025, 1.5], [0.55, 0.0018, 2]] as const).map(([r, w, arc], i) => (
          <mesh key={i}><ringGeometry args={[r, r + w, 128, 1, 0, Math.PI * arc]} />
            <meshBasicMaterial color={BLUE} transparent opacity={0.5 - i * 0.12} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
        ))}
      </group>
    </group>
  )
}

export default function Hologram({ zones, selected, onSelect, className }: { zones: Zone[]; selected?: string; onSelect: (id: string) => void; className?: string }) {
  return (
    <div className={className}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0.9, 5.4], fov: 30 }} gl={{ alpha: true, antialias: true }}>
        <Suspense fallback={null}><Body zones={zones} selected={selected} onSelect={onSelect} /><Base /></Suspense>
        <OrbitControls target={[0, 0.86, 0]} enablePan={false} enableZoom={false} minPolarAngle={1.15} maxPolarAngle={1.7} rotateSpeed={0.5} autoRotate autoRotateSpeed={0.4} />
      </Canvas>
    </div>
  )
}
