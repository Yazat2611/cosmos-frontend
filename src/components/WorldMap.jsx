import { useLayoutEffect, useRef } from 'react'
import { LAND } from '../lib/land.js'
import { esc, relDate } from '../lib/format.js'
import { catLabel, catVar, lastGeo } from './common.jsx'

const proj = (lon, lat) => [lon + 180, 90 - lat]
const GRATICULE = (() => {
  const g = []
  for (let lon = -150; lon <= 150; lon += 30) g.push(`M${lon + 180} 0V180`)
  for (let lat = -60; lat <= 60; lat += 30) g.push(`M0 ${90 - lat}H360`)
  return g.join('')
})()

function Marker({ e, mini, selected, hidden }) {
  const g = e.geometries
  const last = lastGeo(e)
  const [x, y] = proj(last.longitude, last.latitude)
  const pts = g.map((p) => proj(p.longitude, p.latitude))
  // Only events updated in the last day pulse, so the map stays calm with a hundred markers
  const fresh = !e.closed && Date.now() - last.date < 864e5
  const r = mini ? 2.2 : 1.3
  return (
    <g
      className={`marker${fresh ? ' is-open' : ''}`}
      style={{ '--cat': catVar(e.categoryId), opacity: hidden ? 0 : 1, pointerEvents: hidden ? 'none' : undefined, transition: 'opacity 200ms ease' }}
      data-ev={e.eventId}
      data-selected={selected ? '' : undefined}
      data-tip={mini ? undefined : `<b>${esc(e.title)}</b><br><span class='faint'>${esc(catLabel(e))} · updated ${relDate(last.date)}</span>`}
    >
      {g.length > 1 && <polyline className="track" points={pts.map((p) => p.join(',')).join(' ')} />}
      {g.length > 1 && pts.slice(0, -1).map(([px, py], i) => <circle key={i} className="track-pt" cx={px} cy={py} r={mini ? 0.7 : 0.55} />)}
      <circle className="pulse" cx={x} cy={y} r={r} />
      <circle className="core" cx={x} cy={y} r={r} />
      {!mini && <circle cx={x} cy={y} r="5" fill="transparent" />}
    </g>
  )
}

export function WorldMap({ events, mini = false, selected = null, isOn, onPick }) {
  const zoomRef = useRef(null)
  const firstRef = useRef(true)
  const ev = !mini && selected ? events.find((e) => e.eventId === selected) : null

  // Zoom by moving the map group; transform keeps it on the compositor
  const last = ev && lastGeo(ev)
  useLayoutEffect(() => {
    const zoom = zoomRef.current
    if (last) {
      const [x, y] = proj(last.longitude, last.latitude)
      const k = 2.4
      const tx = Math.min(0, Math.max(360 - 360 * k, 180 - x * k))
      const ty = Math.min(0, Math.max(180 - 180 * k, 90 - y * k))
      zoom.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`
    } else zoom.style.transform = ''
    if (firstRef.current) {
      zoom.style.transition = 'none'
      zoom.getBoundingClientRect()
      requestAnimationFrame(() => { zoom.style.transition = '' })
      firstRef.current = false
    }
  }, [last])

  return (
    <svg
      className="map"
      viewBox={mini ? '0 8 360 150' : '0 0 360 180'}
      role="img"
      aria-label="World map of Earth events"
      onClick={onPick ? (e) => { const m = e.target.closest('[data-ev]'); if (m) onPick(m.dataset.ev) } : undefined}
    >
      <g className="map-zoom" ref={zoomRef}>
        <path className="graticule" d={GRATICULE} />
        <path className="land" d={LAND} />
        {events.map((e) => (
          <Marker key={e.eventId} e={e} mini={mini} selected={e.eventId === selected} hidden={isOn ? !isOn(e) : false} />
        ))}
      </g>
    </svg>
  )
}
