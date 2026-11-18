import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../lib/data.jsx'
import { getDetails } from '../../lib/api.js'
import { SAMPLE_ASTEROIDS, elementsFromSbdb } from '../../lib/orbits.js'

const MAX_LOOKUPS = 40
const fetched = new Map() // designation -> elements or null, kept across visits

// Asteroids from the backend's close-approach list, with orbits from its stored SBDB lookups.
// Hazardous and closest objects are looked up first, three at a time. The sample set fills in
// when the backend is offline, so the scene is never empty.
export function useObjects() {
  const { rows, status } = useData()
  const [tick, setTick] = useState(0)

  const upcoming = useMemo(() => {
    const byDes = new Map()
    for (const r of rows) {
      const cur = byDes.get(r.designation)
      const future = r.date > Date.now()
      if (!cur || (future && (cur.date < Date.now() || r.date < cur.date))) byDes.set(r.designation, r)
    }
    return [...byDes.values()].sort((a, b) => (b.pha - a.pha) || a.distanceAu - b.distanceAu)
  }, [rows])

  const wanted = useMemo(() => upcoming.slice(0, MAX_LOOKUPS).map((r) => r.designation), [upcoming])

  useEffect(() => {
    const queue = wanted.filter((d) => !fetched.has(d))
    let stopped = false
    const worker = async () => {
      while (!stopped && queue.length) {
        const des = queue.shift()
        try {
          const det = await getDetails(des)
          const el = elementsFromSbdb(det)
          fetched.set(des, el && { el, fullName: det.object?.fullname, pha: !!det.object?.pha, orbitClass: det.object?.orbit_class?.name })
        } catch {
          fetched.set(des, null)
        }
        if (!stopped) setTick((t) => t + 1)
      }
    }
    for (let k = 0; k < 3; k++) worker()
    return () => { stopped = true }
  }, [wanted])

  return useMemo(() => {
  const live = wanted
    .map((des) => {
      const f = fetched.get(des)
      if (!f) return null
      const r = upcoming.find((x) => x.designation === des)
      return {
        id: des, designation: des, kind: 'asteroid', source: 'backend', el: f.el,
        fullName: f.fullName || r.fullName || des, pha: f.pha || !!r.pha, orbitClass: f.orbitClass || r.orbitClass,
        h: r.absoluteMagnitude, approach: r,
      }
    })
    .filter(Boolean)

  const liveIds = new Set(live.map((a) => a.id))
  const samples = SAMPLE_ASTEROIDS.filter((a) => !liveIds.has(a.id)).map((a) => {
    const r = upcoming.find((x) => x.designation === a.designation)
    return r ? { ...a, approach: r, pha: a.pha || !!r.pha } : a
  })
  const asteroids = [...live, ...samples]
  const pending = wanted.filter((d) => !fetched.has(d)).length
  return { asteroids, status, pending, liveCount: live.length }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, wanted, upcoming, status])
}
