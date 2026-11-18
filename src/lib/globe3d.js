import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { LAND } from './land.js'

const DEG = Math.PI / 180
export function toVec(lat, lon, r = 1, out = new THREE.Vector3()) {
  const phi = (90 - lat) * DEG, th = (lon + 180) * DEG
  return out.set(-Math.cos(th) * Math.sin(phi), Math.cos(phi), Math.sin(th) * Math.sin(phi)).multiplyScalar(r)
}

// LAND is an SVG path on a 360×180 equirectangular grid (x = lon + 180, y = 90 − lat)
function landCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')
  g.scale(w / 360, h / 180)
  const p = new Path2D(LAND)
  return { c, g, p }
}

function landTexture() {
  const { c, g, p } = landCanvas(4096, 2048)
  g.fillStyle = '#0a1210'; g.fillRect(0, 0, 360, 180)
  // Faint graticule every 30°
  g.strokeStyle = 'rgba(169,196,155,0.07)'; g.lineWidth = 0.12
  for (let x = 0; x <= 360; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 180); g.stroke() }
  for (let y = 0; y <= 180; y += 30) { g.beginPath(); g.moveTo(0, y); g.lineTo(360, y); g.stroke() }
  g.fillStyle = '#18221c'; g.fill(p)
  g.strokeStyle = 'rgba(169,196,155,0.35)'; g.lineWidth = 0.1; g.stroke(p)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace
  return t
}

// A dot-matrix of land points, evenly spaced on the sphere
function landDots(step = 0.9) {
  const { g, p } = landCanvas(360, 180)
  const pos = []
  for (let lat = -84; lat <= 84; lat += step) {
    const n = Math.max(1, Math.round((360 / step) * Math.cos(lat * DEG)))
    for (let k = 0; k < n; k++) {
      const lon = -180 + (k / n) * 360
      if (g.isPointInPath(p, lon + 180, 90 - lat)) { const v = toVec(lat, lon, 1.003); pos.push(v.x, v.y, v.z) }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, color: '#a9c49b', transparent: true, opacity: 0.38, depthWrite: false }))
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// Subsolar point, for a day/night terminator that matches the shown date
export function sunDir(ms, out = new THREE.Vector3()) {
  const d = new Date(ms)
  const doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5
  const decl = -23.44 * Math.cos((2 * Math.PI * (doy + 10)) / 365)
  const lon = -((d.getUTCHours() + d.getUTCMinutes() / 60) - 12) * 15
  return toVec(decl, lon, 1, out)
}

// 3D globe for the Earth events page. Imperative, so the React page only passes events and a selection in.
export function createGlobe(host, labelsHost, events, { colorFor, onPick }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#050706')
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100)
  // Open on the terminator, so both the lit and the night side show
  { const u = new Date(); const sunLon = -((u.getUTCHours() + u.getUTCMinutes() / 60) - 12) * 15; camera.position.copy(toVec(18, ((sunLon + 55 + 540) % 360) - 180, 3.6)) }
  const controls = new OrbitControls(camera, renderer.domElement)
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 1.35, maxDistance: 7, enablePan: false, autoRotate: !reduced, autoRotateSpeed: 0.35, rotateSpeed: 0.5 })

  // Stars
  {
    const n = 3000, arr = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20); arr.set([v.x, v.y, v.z], k * 3) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, sizeAttenuation: false, color: 0xcfd6c8, transparent: true, opacity: 0.6 })))
  }

  // Globe: day side lit by the real Sun direction, night side kept readable
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2)
  scene.add(sun, new THREE.AmbientLight(0x9fb4a8, 0.55))
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), new THREE.MeshStandardMaterial({ map: landTexture(), roughness: 0.95, metalness: 0 }))
  scene.add(earth)
  scene.add(landDots())

  // Atmosphere rim
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.09, 64, 64), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color('#7fb3a0') } },
    vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 c; varying vec3 n; varying vec3 v; void main(){ float f = pow(clamp(-dot(n, v) / 0.4, 0., 1.), 2.5); gl_FragColor = vec4(c, f * 0.85); }',
  }))
  scene.add(atmo)

  // Events: a glowing marker at the latest position, plus a track for moving events
  const tex = glowTexture()
  const items = events.map((e) => {
    const color = new THREE.Color(colorFor(e.categoryId))
    const group = new THREE.Group(); scene.add(group)
    const pts = e.geometries.map((g) => toVec(g.latitude, g.longitude, 1.006))
    const dates = e.geometries.map((g) => +g.date)
    let line = null, trackGeo = null
    if (pts.length > 1) {
      // Smooth the observations into a curve hugging the surface
      const curve = new THREE.CatmullRomCurve3(pts)
      const dense = curve.getPoints(pts.length * 16).map((p) => p.setLength(1.006))
      trackGeo = new THREE.BufferGeometry().setFromPoints(dense)
      line = new THREE.Line(trackGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 }))
      group.add(line)
      const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color, size: 3, sizeAttenuation: false }))
      group.add(dots)
      line.userData.n = dense.length
    }
    const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    marker.position.copy(pts[pts.length - 1])
    marker.userData.id = e.eventId
    group.add(marker)
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }))
    ring.position.copy(pts[pts.length - 1]).setLength(1.004); ring.lookAt(0, 0, 0)
    group.add(ring)
    return { e, group, marker, ring, line, pts, dates, phase: Math.random() * 6 }
  })

  // Labels
  const label = document.createElement('span'); label.className = 'lbl'; labelsHost.appendChild(label)

  const state = { selected: null, hovered: null, filter: () => true, timeMs: null, idle: true }
  const listeners = new Set()
  const emit = () => listeners.forEach((f) => f())

  // Picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect()
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const vis = items.filter((i) => i.group.visible).map((i) => i.marker)
    const hits = ray.intersectObjects([earth, ...vis], false)
    // Only markers in front of the globe count
    const first = hits[0]
    if (!first || first.object === earth) {
      const m = hits.find((h) => h.object !== earth)
      return m && first && m.distance < first.distance + 0.02 ? m.object.userData.id : null
    }
    return first.object.userData.id
  }
  let down = null
  renderer.domElement.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; controls.autoRotate = false })
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (down && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) < 5) { const id = pick(ev); if (id) onPick(id) }
    down = null
  })
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.buttons) return
    const id = pick(ev)
    if (id !== state.hovered) { state.hovered = id; renderer.domElement.style.cursor = id ? 'pointer' : '' }
  })

  // Fly: on-screen movement, so ease-in-out along the great circle
  let fly = null
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  function flyTo(lat, lon, dist) {
    const from = camera.position.clone(), to = toVec(lat, lon, dist ?? Math.max(2.3, Math.min(from.length(), 3)))
    if (reduced) { camera.position.copy(to); return }
    fly = { t: 0, from, to }
  }

  function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
  resize()

  const v = new THREE.Vector3(), q = new THREE.Quaternion()
  let last = performance.now()
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now
    const t = now / 1000
    sunDir(state.timeMs ?? Date.now(), sun.position).multiplyScalar(10)
    for (const it of items) {
      const on = state.filter(it.e)
      // In replay, an event shows from its first observation; a track grows with time
      let upto = it.pts.length
      if (state.timeMs != null) {
        upto = it.dates.filter((d) => d <= state.timeMs).length
      }
      it.group.visible = on && upto > 0
      if (!it.group.visible) continue
      const head = it.pts[upto - 1]
      it.marker.position.copy(head)
      it.ring.position.copy(head).setLength(1.004); it.ring.lookAt(0, 0, 0)
      if (it.line) it.line.geometry.setDrawRange(0, Math.max(2, Math.round(((upto - 1) / (it.pts.length - 1)) * it.line.userData.n)))
      const sel = it.e.eventId === state.selected, hov = it.e.eventId === state.hovered
      const camD = camera.position.length() - 1
      const base = 0.05 * Math.max(0.6, camD / 2.6) * (sel ? 1.5 : hov ? 1.25 : 1)
      const pulse = reduced || it.e.closed ? 1 : 1 + 0.12 * Math.sin(t * 2.4 + it.phase)
      it.marker.scale.setScalar(base * pulse)
      it.marker.material.opacity = it.e.closed ? 0.45 : 1
      // A ripple spreads from the selected event: constant motion, so linear
      const ph = reduced ? 0.5 : (t * 0.7) % 1
      it.ring.material.opacity = sel ? 0.6 * (1 - ph) : 0
      it.ring.scale.setScalar(sel ? 0.03 + ph * 0.09 : 0.001)
    }
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.1)
      const k = easeInOut(fly.t)
      const a = fly.from.clone().normalize(), b = fly.to.clone().normalize()
      q.setFromUnitVectors(a, b); const qi = new THREE.Quaternion().slerp(q, k)
      camera.position.copy(a.applyQuaternion(qi)).multiplyScalar(fly.from.length() + (fly.to.length() - fly.from.length()) * k)
      if (fly.t === 1) fly = null
    }
    controls.update()
    renderer.render(scene, camera)
    // Label for the selected or hovered event, hidden on the far side
    const lid = state.hovered || state.selected
    const it = items.find((i) => i.e.eventId === lid && i.group.visible)
    if (it) {
      it.marker.getWorldPosition(v)
      const facing = v.clone().normalize().dot(camera.position.clone().normalize()) > 0.15
      v.project(camera)
      label.textContent = it.e.title
      label.style.opacity = facing ? 1 : 0
      label.style.transform = `translate(${((v.x + 1) / 2) * host.clientWidth}px, ${((1 - v.y) / 2) * host.clientHeight}px) translate(-50%, -190%)`
    } else label.style.opacity = 0
    raf = requestAnimationFrame(frame)
  }
  let raf = requestAnimationFrame(frame)
  const ro = new ResizeObserver(resize); ro.observe(host)

  const api = {
    state,
    select(id, opts = {}) {
      state.selected = id
      if (id) controls.autoRotate = false
      const e = events.find((x) => x.eventId === id)
      if (e && !opts.noFly) { const g = state.timeMs != null ? e.geometries.filter((x) => +x.date <= state.timeMs).at(-1) || e.geometries[0] : e.geometries.at(-1); flyTo(g.latitude, g.longitude) }
      emit()
    },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); label.remove()
      scene.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose() } })
      renderer.dispose(); renderer.domElement.remove()
    },
    setFilter(f) { state.filter = f },
    setTime(ms) { state.timeMs = ms },
    flyTo,
    onChange(f) { listeners.add(f); return () => listeners.delete(f) },
  }
  return api
}
