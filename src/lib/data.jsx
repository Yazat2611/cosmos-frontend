import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getApproaches, getEvents } from './api.js'

const DataContext = createContext(null)
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const [approaches, setApproaches] = useState([])
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('loading')

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

  // The backend stores each asteroid's SBDB lookup, so the hazard flag and full name arrive with the approaches
  const rows = useMemo(
    () => approaches.map((a) => ({ ...a, fullName: a.fullName || a.designation, pha: !!a.pha })),
    [approaches],
  )

  const value = useMemo(
    () => ({ rows, events, status, reload }),
    [rows, events, status, reload],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
