// Keplerian orbits: positions from classical orbital elements, in heliocentric ecliptic coordinates (AU)

const DEG = Math.PI / 180
const J2000 = 2451545.0
const GAUSS_K = 0.01720209895 // rad/day for a in AU, the Sun's GM

export const jdFromMs = (ms) => ms / 864e5 + 2440587.5
export const msFromJd = (jd) => (jd - 2440587.5) * 864e5

// Solve Kepler's equation M = E - e sin E for elliptical orbits
function eccentricAnomaly(M, e) {
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-10) break
  }
  return E
}

// Rotation from the orbital plane into the ecliptic, cached per element set
function frame(el) {
  if (el._f) return el._f
  const O = el.om * DEG, w = el.w * DEG, i = el.i * DEG
  const cO = Math.cos(O), sO = Math.sin(O), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(i), si = Math.sin(i)
  el._f = [
    cw * cO - sw * sO * ci, -sw * cO - cw * sO * ci,
    cw * sO + sw * cO * ci, -sw * sO + cw * cO * ci,
    sw * si, cw * si,
  ]
  return el._f
}

function fromAnomaly(el, E, out) {
  const [a, b, c, d, f, g] = frame(el)
  const xp = el.a * (Math.cos(E) - el.e)
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E)
  out[0] = a * xp + b * yp
  out[1] = c * xp + d * yp
  out[2] = f * xp + g * yp
  return out
}

export const meanMotion = (el) => el.n ?? (GAUSS_K / Math.pow(el.a, 1.5)) / DEG // deg/day
export const periodDays = (el) => 360 / meanMotion(el)

// Position at a Julian date. Planets carry linear rates per century (JPL approximate elements).
export function positionAt(el, jd, out = [0, 0, 0]) {
  const cur = el.rates ? planetElements(el, jd) : el
  const M = (((cur.ma + meanMotion(cur) * (jd - cur.epoch)) % 360) + 360) % 360
  return fromAnomaly(cur, eccentricAnomaly(M * DEG, cur.e), out)
}

export function orbitPoints(el, jd, count = 256) {
  const cur = el.rates ? planetElements(el, jd) : el
  const pts = []
  for (let k = 0; k <= count; k++) pts.push(fromAnomaly(cur, (k / count) * 2 * Math.PI, [0, 0, 0]))
  return pts
}

// Ecliptic (x, y, z) to the scene, where y is up
export const SCALE = 10 // scene units per AU
export const toScene = (p, out) => out.set(p[0] * SCALE, p[2] * SCALE, -p[1] * SCALE)

function planetElements(p, jd) {
  if (p._jd === jd) return p._cur
  const T = (jd - J2000) / 36525
  const [a, e, I, L, peri, node] = p.base.map((v, k) => v + p.rates[k] * T)
  const cur = { a, e, i: I, om: node, w: peri - node, ma: L - peri, epoch: jd, n: p.n }
  p._jd = jd
  p._cur = cur
  return cur
}

// JPL "Approximate Positions of the Planets", valid 1800–2050: a, e, I, L, long. perihelion, long. node and their rates per century
const P = (id, name, color, radius, base, rates, extra = {}) => ({ id, name, kind: 'planet', color, radius, base, rates, n: 0.9856076686 / Math.pow(base[0], 1.5), ...extra })
export const PLANETS = [
  P('mercury', 'Mercury', '#b9b0a6', 0.38, [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]),
  P('venus', 'Venus', '#e8cf9a', 0.6, [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]),
  P('earth', 'Earth', '#5b9cff', 0.63, [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]),
  P('mars', 'Mars', '#e07a54', 0.45, [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]),
  P('jupiter', 'Jupiter', '#d9b48a', 1.5, [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]),
  P('saturn', 'Saturn', '#e6d29c', 1.3, [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794], { ring: true }),
  P('uranus', 'Uranus', '#9fe3e8', 1.0, [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]),
  P('neptune', 'Neptune', '#5d7cff', 1.0, [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]),
]
for (const p of PLANETS) {
  const [a, e, i, , peri, node] = p.base
  p.info = { a, e, i, om: node, w: peri - node }
}

// Well-known asteroids shown even without the backend. Elements are rounded, so positions are illustrative.
const A = (designation, fullName, el, extra = {}) => ({ id: designation, designation, fullName, kind: 'asteroid', source: 'sample', el: { epoch: 2460600.5, ...el }, ...extra })
export const SAMPLE_ASTEROIDS = [
  A('99942', '99942 Apophis', { a: 0.9224, e: 0.1911, i: 3.339, om: 203.96, w: 126.6, ma: 142.0 }, { pha: true, orbitClass: 'Aten', h: 19.1, note: 'Passes about 32,000 km from Earth on 13 April 2029.' }),
  A('101955', '101955 Bennu', { a: 1.1264, e: 0.2037, i: 6.035, om: 2.06, w: 66.22, ma: 101.7 }, { pha: true, orbitClass: 'Apollo', h: 20.2, note: 'Sampled by OSIRIS-REx; the sample reached Earth in 2023.' }),
  A('162173', '162173 Ryugu', { a: 1.191, e: 0.1911, i: 5.866, om: 251.3, w: 211.6, ma: 21.5 }, { pha: true, orbitClass: 'Apollo', h: 19.3, note: 'Sampled by Hayabusa2.' }),
  A('65803', '65803 Didymos', { a: 1.6426, e: 0.3832, i: 3.414, om: 72.99, w: 319.6, ma: 150.0 }, { pha: true, orbitClass: 'Apollo', h: 18.1, note: 'Its moon Dimorphos was struck by DART in 2022.' }),
  A('3200', '3200 Phaethon', { a: 1.2711, e: 0.8898, i: 22.26, om: 265.2, w: 322.2, ma: 200.0 }, { pha: true, orbitClass: 'Apollo', h: 14.3, note: 'Parent body of the Geminid meteor shower.' }),
  A('3122', '3122 Florence', { a: 1.769, e: 0.4233, i: 22.15, om: 336.1, w: 27.85, ma: 50.0 }, { pha: true, orbitClass: 'Amor', h: 14.1 }),
  A('433', '433 Eros', { a: 1.458, e: 0.2228, i: 10.83, om: 304.3, w: 178.9, ma: 310.0 }, { orbitClass: 'Amor', h: 10.4, note: 'First asteroid orbited and landed on, by NEAR Shoemaker.' }),
  A('1036', '1036 Ganymed', { a: 2.665, e: 0.533, i: 26.68, om: 215.5, w: 132.4, ma: 120.0 }, { orbitClass: 'Amor', h: 9.2, note: 'The largest known near-Earth asteroid.' }),
  A('2024 YR4', '(2024 YR4)', { a: 2.516, e: 0.6616, i: 3.408, om: 271.37, w: 134.36, ma: 40.0 }, { orbitClass: 'Apollo', h: 23.9 }),
  A('1', '1 Ceres', { a: 2.7675, e: 0.0785, i: 10.59, om: 80.27, w: 73.6, ma: 291.4 }, { orbitClass: 'Main belt', h: 3.3, note: 'Dwarf planet, visited by Dawn.' }),
  A('4', '4 Vesta', { a: 2.3615, e: 0.0894, i: 7.14, om: 103.7, w: 151.5, ma: 26.8 }, { orbitClass: 'Main belt', h: 3.2, note: 'Visited by Dawn.' }),
]

// SBDB lookups (via the backend's /asteroids/details) list elements as [{ name, value }]
export function elementsFromSbdb(det) {
  const map = Object.fromEntries((det?.orbit?.elements || []).map((x) => [x.name, parseFloat(x.value)]))
  const epoch = parseFloat(det?.orbit?.epoch)
  const el = { a: map.a, e: map.e, i: map.i, om: map.om, w: map.w, ma: map.ma, epoch }
  if (Object.values(el).some((v) => !Number.isFinite(v)) || el.e >= 1) return null
  if (Number.isFinite(map.n)) el.n = map.n
  return el
}

// A seeded field of main-belt asteroids, for context only
export function beltElements(count, seed = 7) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const out = []
  for (let k = 0; k < count; k++) {
    // Avoid the main Kirkwood gaps at 2.50 and 2.82 AU
    let a
    do a = 2.15 + rnd() * 1.15
    while (Math.abs(a - 2.5) < 0.025 || Math.abs(a - 2.82) < 0.02)
    out.push({ a, e: rnd() * 0.22, i: rnd() * rnd() * 22, om: rnd() * 360, w: rnd() * 360, ma: rnd() * 360, epoch: J2000 })
  }
  return out
}
