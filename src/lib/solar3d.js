import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PLANETS, SAMPLE_ASTEROIDS, beltElements, jdFromMs, orbitPoints, positionAt, toScene } from './orbits.js'

export const COLORS = { pha: '#e2c07f', neo: '#a9c49b' }
const tmp = [0, 0, 0]

// A small live solar system for cards: planets and sample asteroids on their real orbits, slowly turning
export function createScene(host, labelsHost, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#050706')
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 8000)
  camera.position.set(...(opts.cam || [0, 26, 34]))
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 0.3
  controls.maxDistance = 800
  controls.autoRotate = !!opts.autoRotate && !matchMedia('(prefers-reduced-motion: reduce)').matches
  controls.autoRotateSpeed = 0.25
  if (opts.noZoom) controls.enableZoom = false

  scene.add(new THREE.AmbientLight(0xffffff, 0.12))
  const light = new THREE.PointLight(0xffffff, 2.6, 0, 0)
  scene.add(light)

  // Starfield
  {
    const n = 6000, arr = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 300)
      arr.set([v.x, v.y, v.z], k * 3)
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.2, sizeAttenuation: false, color: 0xcfd6c8, transparent: true, opacity: 0.7 })))
  }

  // Sun with a soft additive glow
  const sun = new THREE.Group()
  sun.add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 48, 48), new THREE.MeshBasicMaterial({ color: '#ffd889' })))
  {
    const c = document.createElement('canvas'); c.width = c.height = 128
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(0.18, 'rgba(255,200,110,.55)'); gr.addColorStop(0.45, 'rgba(255,150,60,.12)'); gr.addColorStop(1, 'rgba(255,140,40,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    s.scale.set(9, 9, 1); sun.add(s)
  }
  scene.add(sun)

  const objects = [{ id: 'sun', kind: 'star', name: 'Sun', group: sun }]
  const clock = { ms: Date.now(), rate: 1, jd: jdFromMs(Date.now()) }

  function addBody(obj) {
    const isPlanet = obj.kind === 'planet'
    const el = isPlanet ? obj : obj.el
    const color = isPlanet ? obj.color : obj.pha ? COLORS.pha : COLORS.neo
    const pts = orbitPoints(el, clock.jd).map((p) => toScene(p, new THREE.Vector3()))
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: isPlanet ? 0.3 : 0.14, depthWrite: false })
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat))
    const radius = isPlanet ? 0.12 + obj.radius * 0.22 : 0.05
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 24), isPlanet
      ? new THREE.MeshStandardMaterial({ color: obj.color, roughness: 0.85, emissive: obj.color, emissiveIntensity: 0.08 })
      : new THREE.MeshBasicMaterial({ color }))
    if (obj.ring) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.35, radius * 2.3, 64), new THREE.MeshBasicMaterial({ color: '#d8c69a', side: THREE.DoubleSide, transparent: true, opacity: 0.55 }))
      ring.rotation.x = -Math.PI / 2 + 0.47; mesh.add(ring)
    }
    const group = new THREE.Group(); group.add(mesh); scene.add(group)
    mesh.userData.id = obj.id
    objects.push({ ...obj, group, mesh, radius, lineMat, baseOpacity: lineMat.opacity, color, el })
  }
  PLANETS.forEach(addBody)
  SAMPLE_ASTEROIDS.forEach(addBody)

  // Decorative main belt
  const belt = beltElements(2200)
  const beltGeo = new THREE.BufferGeometry(); beltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(belt.length * 3), 3))
  const beltPts = new THREE.Points(beltGeo, new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: false, color: '#8d9088', transparent: true, opacity: 0.5, depthWrite: false }))
  scene.add(beltPts)

  // Labels: DOM spans positioned each frame
  const labels = new Map()
  let labelMode = 'planets'
  let selected = null, hovered = null
  function syncLabels() {
    const want = objects.filter((o) => o.id === selected || o.id === hovered || (labelMode === 'planets' && o.kind === 'planet') || (labelMode === 'all' && o.kind !== 'star'))
    const ids = new Set(want.map((o) => o.id))
    for (const [id, el] of labels) if (!ids.has(id)) { el.remove(); labels.delete(id) }
    for (const o of want) {
      let el = labels.get(o.id)
      if (!el) { el = document.createElement('span'); el.className = 'lbl'; el.textContent = o.name || o.fullName; labelsHost.appendChild(el); labels.set(o.id, el) }
      el.classList.toggle('on', o.id === selected || o.id === hovered)
      el.classList.toggle('pha', !!o.pha)
      el.classList.toggle('planet', o.kind === 'planet')
    }
  }

  // Picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  let down = null
  const listeners = new Set()
  const emit = () => listeners.forEach((f) => f())
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(objects.filter((o) => o.mesh).map((o) => o.mesh), false)[0]
    return hit?.object.userData.id ?? null
  }
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY] })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) { const id = pick(e); if (id) api.select(id) }
    down = null
  })
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons) return
    const id = pick(e)
    if (id !== hovered) { hovered = id; renderer.domElement.style.cursor = id ? 'pointer' : ''; syncLabels() }
  })

  // Camera flight: an on-screen move, so ease-in-out; then it follows the body
  let fly = null
  const want = new THREE.Vector3(), v = new THREE.Vector3()
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  function resize() {
    const w = host.clientWidth, h = host.clientHeight
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize); ro.observe(host); resize()

  let last = performance.now()
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now
    clock.ms += dt * clock.rate * 864e5; clock.jd = jdFromMs(clock.ms)
    for (const o of objects) {
      if (!o.mesh) continue
      toScene(positionAt(o.el, clock.jd, tmp), o.group.position)
      const d = camera.position.distanceTo(o.group.position)
      const s = Math.max(o.radius, d * (o.kind === 'planet' ? 0.006 : 0.0045) * (o.id === selected ? 1.3 : 1))
      o.mesh.scale.setScalar(s / o.radius)
      o.lineMat.opacity = o.id === selected || o.id === hovered ? 0.9 : o.baseOpacity
    }
    if (beltPts.visible) {
      const arr = beltGeo.attributes.position.array
      for (let k = 0; k < belt.length; k++) { toScene(positionAt(belt[k], clock.jd, tmp), v); arr[k * 3] = v.x; arr[k * 3 + 1] = v.y; arr[k * 3 + 2] = v.z }
      beltGeo.attributes.position.needsUpdate = true
    }
    const sel = objects.find((o) => o.id === selected)
    if (sel) sel.group.getWorldPosition(want); else want.set(0, 0, 0)
    if (fly) {
      fly.t = Math.min(1, fly.t + dt / 1.2)
      const k = easeInOut(fly.t)
      controls.target.lerpVectors(fly.fromTarget, want, k)
      const dir = fly.fromOffset.clone().normalize()
      const len = fly.fromOffset.length() + (fly.dist - fly.fromOffset.length()) * k
      camera.position.copy(controls.target).addScaledVector(dir, len)
      if (fly.t === 1) fly = null
    } else if (sel) {
      v.copy(want).sub(controls.target); controls.target.add(v); camera.position.add(v)
    }
    controls.update()
    renderer.render(scene, camera)
    const w = host.clientWidth, h = host.clientHeight
    for (const [id, el] of labels) {
      const o = objects.find((x) => x.id === id)
      o.group.getWorldPosition(v).project(camera)
      const hidden = v.z > 1
      el.style.opacity = hidden ? 0 : ''
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -160%)`
    }
    raf = requestAnimationFrame(frame)
  }
  let raf = requestAnimationFrame(frame)
  syncLabels()

  const api = {
    clock, objects,
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); labelsHost.innerHTML = ''
      scene.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose() } })
      renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove()
    },
    get selected() { return selected },
    select(id) {
      selected = id
      const o = objects.find((x) => x.id === id)
      fly = {
        t: 0, fromTarget: controls.target.clone(), fromOffset: camera.position.clone().sub(controls.target),
        dist: !id ? 48 : id === 'sun' ? 40 : o.kind === 'planet' ? 6 + o.radius * 8 : 9,
      }
      syncLabels(); emit()
    },
    setRate(r) { clock.rate = r; emit() },
    setLabels(m) { labelMode = m; syncLabels() },
    setBelt(on) { beltPts.visible = on },
    onChange(f) { listeners.add(f); return () => listeners.delete(f) },
    earthDistance(o, jd) {
      const e = positionAt(PLANETS[2], jd, [0, 0, 0])
      const p = o.kind === 'star' ? [0, 0, 0] : positionAt(o.el, jd, [0, 0, 0])
      return Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2])
    },
    sunDistance(o, jd) { return o.kind === 'star' ? 0 : Math.hypot(...positionAt(o.el, jd, [0, 0, 0])) },
  }
  return api
}
