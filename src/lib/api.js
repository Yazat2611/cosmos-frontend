import { toDate } from './format.js'

// Same origin in dev (Vite proxies /api); set VITE_API_URL for a deployed backend
const BASE = import.meta.env.VITE_API_URL || ''

async function request(path, options) {
  const res = await fetch(`${BASE}/api${path}`, options)
  if (!res.ok) throw new Error(`Request to ${path} failed with status ${res.status}`)
  const type = res.headers.get('content-type') || ''
  return type.includes('json') ? res.json() : res.text()
}

export async function getApproaches() {
  const rows = await request('/asteroids/all')
  const seen = new Set()
  return rows
    .map((r) => ({ ...r, date: toDate(r.closeApproachDate) }))
    .filter((r) => {
      const key = `${r.designation}|${r.date?.getTime()}`
      if (!r.date || r.distanceAu == null || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export async function getEvents() {
  const rows = await request('/earth-events')
  return rows
    .map((e) => ({
      ...e,
      geometries: (e.geometries || [])
        .map((g) => ({ ...g, date: toDate(g.observationDate) }))
        .filter((g) => g.date && g.longitude != null && g.latitude != null)
        .sort((a, b) => a.date - b.date),
    }))
    .filter((e) => e.geometries.length)
}

const details = new Map()
export function getDetails(designation) {
  if (!details.has(designation)) {
    const p = request(`/asteroids/details/${encodeURIComponent(designation)}`).then((d) => {
      if (!d?.object || !d?.orbit) throw new Error(`NASA has no record for ${designation}`)
      return d
    })
    p.catch(() => details.delete(designation))
    details.set(designation, p)
  }
  return details.get(designation)
}
