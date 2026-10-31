import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getApproaches, getDetails, getEvents } from './api.js'

const DataContext = createContext(null)
export const useData = () => useContext(DataContext)

const CACHE_KEY = 'cosmos-objects-v1'
const CACHE_MS = 7 * 864e5

function readCache() {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}
    return Object.fromEntries(Object.entries(all).filter(([, v]) => Date.now() - v.t < CACHE_MS))
  } catch {
    return {}
  }
}

export function DataProvider({ children }) {
  const [approaches, setApproaches] = useState([])
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('loading')
  const [objects, setObjects] = useState(readCache)

  const reload = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([getApproaches(), getEvents()])
      setApproaches(a)
      setEvents(e)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  }, [reload])

  // Hazard status only comes from the per-object SBDB lookup. By definition a PHA has H <= 22,
  // so only those objects are looked up, two at a time, and the results are cached.
  const candidates = useMemo(
    () => [...new Set(approaches.filter((a) => a.absoluteMagnitude != null && a.absoluteMagnitude <= 22).map((a) => a.designation))],
    [approaches],
  )
  useEffect(() => {
    const queue = candidates.filter((d) => !readCache()[d])
    let stopped = false
    const worker = async () => {
      while (!stopped && queue.length) {
        const des = queue.shift()
        try {
          const d = await getDetails(des)
          if (stopped) return
          const entry = { pha: !!d.object.pha, fullName: d.object.fullname, cls: d.object.orbit_class?.name, t: Date.now() }
          setObjects((o) => {
            const next = { ...o, [des]: entry }
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { /* the cache is optional */ }
            return next
          })
        } catch { /* leave it unknown; the next load retries */ }
      }
    }
    worker()
    worker()
    return () => { stopped = true }
  }, [candidates])

  const rows = useMemo(
    () => approaches.map((a) => ({ ...a, fullName: objects[a.designation]?.fullName || a.designation, pha: !!objects[a.designation]?.pha })),
    [approaches, objects],
  )
  const checked = candidates.filter((d) => objects[d]).length

  const value = useMemo(
    () => ({ rows, events, status, reload, hazard: { checked, total: candidates.length } }),
    [rows, events, status, reload, checked, candidates.length],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
