import { memo, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { PLANETS, SCALE, beltElements, jdFromMs, orbitPoints, positionAt, toScene } from '../../lib/orbits.js'

const PHA = '#e2c07f'
const NEO = '#a9c49b'
const tmp = [0, 0, 0]

// Advances simulated time; everything else reads clock.ms during its own frame
function Clock({ clock }) {
  useFrame((_, dt) => {
    if (clock.playing) clock.ms += Math.min(dt, 0.1) * clock.rate * 864e5
    clock.jd = jdFromMs(clock.ms)
  }, -1)
  return null
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,236,190,1)')
  grad.addColorStop(0.18, 'rgba(255,200,110,0.55)')
  grad.addColorStop(0.45, 'rgba(255,150,60,0.12)')
  grad.addColorStop(1, 'rgba(255,140,40,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function Sun({ registry, onSelect }) {
  const tex = useMemo(glowTexture, [])
  return (
    <group ref={(g) => { registry.current.sun = g }}>
      <mesh onClick={(e) => { e.stopPropagation(); onSelect('sun') }}>
        <sphereGeometry args={[0.9, 48, 48]} />
        <meshBasicMaterial color="#ffd889" />
      </mesh>
      <sprite scale={[9, 9, 1]}>
        <spriteMaterial map={tex} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
      </sprite>
      <pointLight intensity={2.6} decay={0} />
    </group>
  )
}

// Keeps a body visible at any zoom: never smaller than a few pixels on screen
function useScreenScale(ref, base, minPx = 0.0045) {
  const { camera } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  return (state) => {
    const g = ref.current
    if (!g) return
    const d = camera.position.distanceTo(g.getWorldPosition(v))
    const s = Math.max(base, d * minPx * (state.selected ? 1.6 : 1))
    g.scale.setScalar(s / base)
  }
}

const OrbitPath = memo(function OrbitPath({ el, jd, color, opacity, width = 1 }) {
  const pts = useMemo(() => orbitPoints(el, jd).map((p) => toScene(p, new THREE.Vector3())), [el, jd])
  return <Line points={pts} color={color} lineWidth={width} transparent opacity={opacity} depthWrite={false} />
})

function Body({ obj, clock, registry, selected, hovered, onSelect, onHover }) {
  const group = useRef(null)
  const mesh = useRef(null)
  const isPlanet = obj.kind === 'planet'
  const radius = isPlanet ? 0.12 + obj.radius * 0.22 : 0.05
  const scaleFn = useScreenScale(mesh, radius, isPlanet ? 0.006 : 0.0035)
  const el = isPlanet ? obj : obj.el
  const color = isPlanet ? obj.color : obj.pha ? PHA : NEO
  // Planet orbits drift slowly; redraw them once per simulated decade
  const orbitJd = isPlanet ? Math.round((clock.jd ?? jdFromMs(clock.ms)) / 3650) * 3650 : el.epoch

  useFrame(() => {
    positionAt(el, clock.jd, tmp)
    toScene(tmp, group.current.position)
    scaleFn({ selected })
  })

  const active = selected || hovered
  return (
    <>
      <OrbitPath el={el} jd={orbitJd} color={color} opacity={active ? 0.9 : isPlanet ? 0.32 : 0.14} width={active ? 1.6 : 1} />
      <group ref={(g) => { group.current = g; registry.current[obj.id] = g }}>
        <mesh
          ref={mesh}
          onClick={(e) => { e.stopPropagation(); onSelect(obj.id) }}
          onPointerOver={(e) => { e.stopPropagation(); onHover(obj.id); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { onHover(null); document.body.style.cursor = '' }}
        >
          <sphereGeometry args={[radius, isPlanet ? 32 : 12, isPlanet ? 32 : 12]} />
          {isPlanet
            ? <meshStandardMaterial color={obj.color} roughness={0.85} metalness={0} emissive={obj.color} emissiveIntensity={0.08} />
            : <meshBasicMaterial color={color} />}
          {obj.ring && (
            <mesh rotation={[-Math.PI / 2 + 0.47, 0, 0]}>
              <ringGeometry args={[radius * 1.35, radius * 2.3, 64]} />
              <meshBasicMaterial color="#d8c69a" side={THREE.DoubleSide} transparent opacity={0.55} />
            </mesh>
          )}
        </mesh>
      </group>
    </>
  )
}

function Belt({ clock, count = 2400 }) {
  const els = useMemo(() => beltElements(count), [count])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    return g
  }, [count])
  const v = useMemo(() => new THREE.Vector3(), [])
  const last = useRef(null)
  useFrame(() => {
    if (last.current === clock.jd) return
    last.current = clock.jd
    const arr = geo.attributes.position.array
    for (let k = 0; k < count; k++) {
      toScene(positionAt(els[k], clock.jd, tmp), v)
      arr[k * 3] = v.x; arr[k * 3 + 1] = v.y; arr[k * 3 + 2] = v.z
    }
    geo.attributes.position.needsUpdate = true
  })
  return (
    <points geometry={geo} raycast={() => null}>
      <pointsMaterial size={1.3} sizeAttenuation={false} color="#8d8fa6" transparent opacity={0.55} depthWrite={false} />
    </points>
  )
}

// Labels are plain DOM over the canvas, moved each frame to their body's projected position
function LabelSync({ registry, layer }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const root = layer.current
    if (!root) return
    for (const el of root.children) {
      const g = registry.current[el.dataset.id]
      if (!g) { el.style.opacity = 0; continue }
      g.getWorldPosition(v).project(camera)
      const hidden = v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2
      el.style.opacity = hidden ? 0 : ''
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -150%)`
    }
  })
  return null
}

// On phones the details sheet covers the lower half, so the focused body is drawn higher up
function ViewShift({ shift }) {
  const { camera, size } = useThree()
  useEffect(() => {
    if (shift) camera.setViewOffset(size.width, size.height, 0, size.height * shift, size.width, size.height)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
  }, [camera, size, shift])
  return null
}

// Eases the view onto the selected body, then keeps following it as it moves
function Rig({ registry, selected, controls }) {
  const { camera } = useThree()
  const fly = useRef({ t: 1, dist: 0 })
  const prev = useMemo(() => new THREE.Vector3(), [])
  const want = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => {
    const obj = selected && registry.current[selected]
    const planet = PLANETS.find((p) => p.id === selected)
    fly.current = { t: 0, dist: selected === 'sun' ? 60 : planet ? 4 + planet.radius * 6 : obj ? 3 : 0 }
    if (!selected) fly.current = { t: 0, dist: 0, home: true }
  }, [selected, registry])
  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    const g = selected && registry.current[selected]
    if (g) g.getWorldPosition(want)
    else want.set(0, 0, 0)
    prev.copy(c.target)
    const f = fly.current
    if (f.t < 1) {
      f.t = Math.min(1, f.t + dt / 1.4)
      const k = 1 - Math.pow(1 - f.t, 3)
      c.target.lerp(want, k)
      if (f.dist) {
        const off = camera.position.clone().sub(c.target)
        const d = off.length()
        off.setLength(d + (f.dist - d) * k * 0.15)
        camera.position.copy(c.target).add(off)
      }
      if (f.home && f.t === 1) f.home = false
    } else if (g) {
      c.target.copy(want)
      camera.position.add(want.clone().sub(prev))
    }
    c.update()
  })
  return null
}

export default function Scene({ clock, asteroids, selected, hovered, onSelect, onHover, showBelt, showLabels, viewShift }) {
  const registry = useRef({})
  const controls = useRef(null)
  const layer = useRef(null)
  const labels = [
    ...(showLabels ? PLANETS : []),
    ...asteroids.filter((a) => a.id === selected || a.id === hovered),
    ...PLANETS.filter((p) => !showLabels && (p.id === selected || p.id === hovered)),
  ]
  return (
    <div className="x-scene">
    <Canvas
      camera={{ position: [0, 26, 34], fov: 50, near: 0.01, far: 8000 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={() => {}}
    >
      <color attach="background" args={['#050706']} />
      <ambientLight intensity={0.12} />
      <Stars radius={900} depth={200} count={7000} factor={5} saturation={0} fade speed={0.3} />
      <Clock clock={clock} />
      <Sun registry={registry} onSelect={onSelect} />
      {PLANETS.map((p) => (
        <Body key={p.id} obj={p} clock={clock} registry={registry} selected={selected === p.id} hovered={hovered === p.id} onSelect={onSelect} onHover={onHover} />
      ))}
      {asteroids.map((a) => (
        <Body key={a.id} obj={a} clock={clock} registry={registry} selected={selected === a.id} hovered={hovered === a.id} onSelect={onSelect} onHover={onHover} />
      ))}
      {showBelt && <Belt clock={clock} />}
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} minDistance={0.3} maxDistance={40 * SCALE * 2} />
      <Rig registry={registry} selected={selected} controls={controls} />
      <LabelSync registry={registry} layer={layer} />
      <ViewShift shift={selected ? viewShift : 0} />
    </Canvas>
    <div className="x-labels" ref={layer} aria-hidden="true">
      {labels.map((o) => {
        const active = o.id === selected || o.id === hovered
        return <span key={o.id} data-id={o.id} className={`x-label${active ? ' is-active' : ''}${o.pha ? ' is-pha' : ''}${o.kind === 'planet' ? ' is-planet' : ''}`}>{o.name || o.fullName}</span>
      })}
    </div>
    </div>
  )
}
