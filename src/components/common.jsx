import { useLayoutEffect, useRef } from 'react'
import { useData } from '../lib/data.jsx'

const PATHS = {
  overview: 'M3 4.5A1.5 1.5 0 0 1 4.5 3h3A1.5 1.5 0 0 1 9 4.5v3A1.5 1.5 0 0 1 7.5 9h-3A1.5 1.5 0 0 1 3 7.5zM11 4.5A1.5 1.5 0 0 1 12.5 3h3A1.5 1.5 0 0 1 17 4.5v3A1.5 1.5 0 0 1 15.5 9h-3A1.5 1.5 0 0 1 11 7.5zM3 12.5A1.5 1.5 0 0 1 4.5 11h3A1.5 1.5 0 0 1 9 12.5v3A1.5 1.5 0 0 1 7.5 17h-3A1.5 1.5 0 0 1 3 15.5zM11 12.5a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5z',
  rock: 'M8.6 3.2c1.6-.7 3.6-.3 4.9.6 1.6 1.1 3.4 1.6 3.4 4 0 1.7-.7 2.3-.5 4 .2 1.9-1.3 4-3.6 4.3-1.6.2-2.4-.6-4-.4-2 .3-4.2-.4-5-2.4-.7-1.6.2-2.7 0-4.3-.3-2.3 1.6-4.9 4.8-5.8z',
  earth: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4.1 8.2a6 6 0 0 1 4.3-4l-.6 1.6 1 1.7-1.6 1.4.5 1.7-1.9.6zm2.4 6.6.9-1.7 2-.3 1.1 1.4 1.8-.2.4 1.9a6 6 0 0 1-6.2-1.1zm9-2.8-1.8-.7-.3-2 1.4-1.6 1.1.3a6 6 0 0 1-.4 4zM11.6 4.2a6 6 0 0 1 3.2 2.3l-1.9.4-1.3-1.2z',
  search: 'M8.5 3a5.5 5.5 0 1 0 3.4 9.8l3.6 3.6a.9.9 0 0 0 1.3-1.3l-3.6-3.6A5.5 5.5 0 0 0 8.5 3zM4.8 8.5a3.7 3.7 0 1 1 7.4 0 3.7 3.7 0 0 1-7.4 0z',
  close: 'M5.3 4.1a.9.9 0 0 0-1.2 1.2L8.8 10l-4.7 4.7a.9.9 0 1 0 1.2 1.2l4.7-4.7 4.7 4.7a.9.9 0 0 0 1.2-1.2L11.2 10l4.7-4.7a.9.9 0 0 0-1.2-1.2L10 8.8z',
  copy: 'M7 3.5A1.5 1.5 0 0 1 8.5 2h7A1.5 1.5 0 0 1 17 3.5v7a1.5 1.5 0 0 1-1.5 1.5H14v-1.8h1.2V3.8H8.8V5H7zM3 8.5A1.5 1.5 0 0 1 4.5 7h7A1.5 1.5 0 0 1 13 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 15.5zm1.8.3v6.4h6.4V8.8z',
  check: 'M16.2 5.3a.9.9 0 0 1 0 1.3l-7.5 7.5a.9.9 0 0 1-1.3 0L3.8 10.5a.9.9 0 1 1 1.3-1.3l3 3 6.8-6.9a.9.9 0 0 1 1.3 0z',
  ext: 'M11 3.9a.9.9 0 0 1 .9-.9h4.2a.9.9 0 0 1 .9.9v4.2a.9.9 0 1 1-1.8 0V6.1l-5.6 5.6a.9.9 0 0 1-1.3-1.3l5.6-5.6h-2a.9.9 0 0 1-.9-.9zM3 6.5A2.5 2.5 0 0 1 5.5 4h2.4a.9.9 0 1 1 0 1.8H5.5a.7.7 0 0 0-.7.7v8c0 .4.3.7.7.7h8c.4 0 .7-.3.7-.7v-2.4a.9.9 0 1 1 1.8 0v2.4a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 3 14.5z',
  page: 'M5.5 3A1.5 1.5 0 0 0 4 4.5v11A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V8l-5-5zm5 1.5L14.5 8.5h-4z',
  pause: 'M6 4.5h2.6v11H6zM11.4 4.5H14v11h-2.6z',
  play: 'M6.5 4.3v11.4L15.6 10z',
}
export function Icon({ name }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d={PATHS[name]} /></svg>
}
export const Caret = () => <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 2.5 8.5 7h-7z" /></svg>

// The active copy is clipped, so text and fill change together
export function Segmented({ options, value, onChange }) {
  const listRef = useRef(null)
  const activeRef = useRef(null)
  const first = useRef(true)
  const labels = options.map(([v]) => v).join()
  useLayoutEffect(() => {
    const list = listRef.current
    const active = activeRef.current
    const btn = list.querySelector(`[data-v="${value}"]`)
    if (first.current) active.style.transition = 'none'
    active.style.clipPath = `inset(0 ${list.offsetWidth - btn.offsetLeft - btn.offsetWidth}px 0 ${btn.offsetLeft}px round 7px)`
    if (first.current) { void active.offsetWidth; active.style.transition = '' }
    first.current = false
  }, [value, labels, options])
  return (
    <div className="seg">
      <div className="seg-list" ref={listRef}>
        {options.map(([v, l]) => (
          <button key={v} type="button" data-v={v} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
      <div className="seg-active" ref={activeRef} aria-hidden="true">
        <div className="seg-list">
          {options.map(([v, l]) => <button key={v} type="button" tabIndex={-1}>{l}</button>)}
        </div>
      </div>
    </div>
  )
}

export function BackendNotice() {
  const { status, reload } = useData()
  if (status !== 'error') return null
  return (
    <div className="notice" role="alert">
      <span>Can't reach the Cosmos Hub backend. Check that it's running on port 8080.</span>
      <button className="btn" type="button" onClick={reload}>Try again</button>
    </div>
  )
}

export function Loading({ height = 320 }) {
  return <div className="skel" style={{ height, borderRadius: 14 }} aria-label="Loading" />
}

export const CAT_LABELS = {
  wildfires: 'Wildfires',
  severeStorms: 'Severe storms',
  volcanoes: 'Volcanoes',
  seaLakeIce: 'Sea & lake ice',
  dustHaze: 'Dust & haze',
  floods: 'Floods',
  snow: 'Snow',
  landslides: 'Landslides',
}
export const catLabel = (e) => CAT_LABELS[e.categoryId] || e.categoryTitle || 'Other'
export const catVar = (id) => `var(--c-${id}, var(--text-3))`
export const lastGeo = (e) => e.geometries[e.geometries.length - 1]
