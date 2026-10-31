import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { absDate, esc, plural, relDate } from '../lib/format.js'
import { LAND } from '../lib/land.js'
import { globe, reduced } from '../lib/motion.js'
import { go, hideTip, showTip } from '../lib/ui.js'
import { BackendNotice, Icon, Loading, Segmented, catLabel, catVar, lastGeo } from '../components/common.jsx'
import { WorldMap } from '../components/WorldMap.jsx'

const pick = (id) => go(`#/earth/${id}`, 'pointer')

function Globe({ events, off, selected, visible }) {
  const canvas = useRef(null)
  const scene = useRef(null)
  const offRef = useRef(off)
  const list = useRef(events)
  useLayoutEffect(() => { offRef.current = off; scene.current?.redraw() }, [off])

  useEffect(() => {
    const anchor = { x: 0, y: 0, getBoundingClientRect: () => new DOMRect(anchor.x, anchor.y, 0, 0) }
    const g = globe(canvas.current, {
      land: LAND,
      events: list.current,
      isOn: (e) => !offRef.current.has(e.categoryId),
      onSelect: pick,
      onHover: (e, x, y) => {
        if (!e) return hideTip()
        anchor.x = x
        anchor.y = y - 6
        showTip(anchor, `<b>${esc(e.title)}</b><br><span class='faint'>${esc(catLabel(e))} · updated ${relDate(lastGeo(e).date)}</span>`)
      },
    })
    scene.current = g
    return () => { g.destroy(); scene.current = null }
  }, [])

  const ev = selected ? events.find((e) => e.eventId === selected) : null
  useEffect(() => { scene.current?.select(ev?.eventId || null, ev || null) }, [ev])
  useEffect(() => { if (visible) scene.current?.redraw() }, [visible])

  return (
    <div className="globe-wrap" hidden={!visible}>
      <canvas className="globe" ref={canvas} aria-label="Interactive globe of Earth events. Drag to spin." />
      <div className="globe-hint faint">Drag to spin</div>
    </div>
  )
}

function Summary({ events }) {
  const open = events.filter((e) => !e.closed)
  const counts = {}
  open.forEach((e) => { const k = catLabel(e); counts[k] = (counts[k] || 0) + 1 })
  let peak = null
  open.filter((e) => e.categoryId === 'severeStorms').forEach((e) => e.geometries.forEach((g) => {
    if (g.magnitudeValue != null && (!peak || g.magnitudeValue > peak.g.magnitudeValue)) peak = { e, g }
  }))
  return (
    <div className="ev-detail">
      <div className="faint" style={{ fontSize: 12 }}>Right now</div>
      <h3>{plural(open.length, 'open event', 'open events')}</h3>
      <dl className="ev-meta">
        {Object.entries(counts).map(([k, n]) => <div key={k}><dt>{k}</dt><dd>{n}</dd></div>)}
      </dl>
      {peak && <p>Strongest storm: <b style={{ color: 'var(--text)', fontWeight: 500 }}>{peak.e.title}</b>, peaking at {peak.g.magnitudeValue} {peak.g.magnitudeUnit}.</p>}
      <p className="faint" style={{ fontSize: 12.5 }}>Select a marker or an event to see its history.</p>
    </div>
  )
}

function Detail({ e }) {
  const g = e.geometries
  const last = lastGeo(e)
  const mags = g.filter((x) => x.magnitudeValue != null)
  const color = catVar(e.categoryId)
  let spark = null
  if (mags.length > 1) {
    const vals = mags.map((x) => x.magnitudeValue)
    const lo = Math.min(...vals) * 0.9
    const hi = Math.max(...vals) * 1.05
    const W = 320
    const H = 64
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (W - 8) + 4, H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 14)])
    spark = (
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill={color} />)}
      </svg>
    )
  }
  return (
    <div className="ev-detail">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="badge" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}><span className="sw" />{catLabel(e)}</span>
        {e.closed ? <span className="badge">Closed</span> : <span className="badge ok">Open</span>}
      </div>
      <h3>{e.title}</h3>
      {e.description && <p>{e.description}</p>}
      <dl className="ev-meta">
        <div><dt>Latest position</dt><dd>{Math.abs(last.latitude).toFixed(2)}°{last.latitude >= 0 ? 'N' : 'S'}, {Math.abs(last.longitude).toFixed(2)}°{last.longitude >= 0 ? 'E' : 'W'}</dd></div>
        <div><dt>{last.magnitudeValue != null ? 'Latest magnitude' : 'Geometry'}</dt><dd>{last.magnitudeValue != null ? `${last.magnitudeValue.toLocaleString()} ${last.magnitudeUnit || ''}` : last.geometryType === 'Polygon' ? 'Polygon centroid' : 'Point'}</dd></div>
        <div><dt>First reported</dt><dd>{absDate(g[0].date, false)}</dd></div>
        <div><dt>Source</dt><dd>{e.sourceId || '—'}</dd></div>
      </dl>
      {spark && <><div className="faint" style={{ fontSize: 11.5 }}>Intensity over time ({last.magnitudeUnit})</div>{spark}</>}
      {g.length > 1 && (
        <ul className="obs">
          {g.slice().reverse().slice(0, 5).map((x) => (
            <li key={x.id}><span className="faint">{absDate(x.date)}</span><span>{x.magnitudeValue != null ? `${x.magnitudeValue} ${x.magnitudeUnit || ''}` : `${x.latitude.toFixed(1)}, ${x.longitude.toFixed(1)}`}</span></li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {e.link && <a className="btn" href={e.link} target="_blank" rel="noopener noreferrer"><Icon name="ext" />EONET record</a>}
        <a className="btn ghost" href="#/earth">Back to all</a>
      </div>
    </div>
  )
}

export function Earth({ sub }) {
  const { events, status } = useData()
  const [off, setOff] = useState(() => new Set())
  const [view, setView] = useState('globe')
  const ev = sub ? events.find((e) => e.eventId === sub) : null
  const selected = ev?.eventId || null

  const cats = useMemo(() => {
    const m = new Map()
    events.forEach((e) => {
      const c = m.get(e.categoryId) || { id: e.categoryId, label: catLabel(e), n: 0 }
      c.n++
      m.set(e.categoryId, c)
    })
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [events])
  const list = useMemo(
    () => events.filter((e) => !off.has(e.categoryId)).sort((a, b) => lastGeo(b).date - lastGeo(a).date),
    [events, off],
  )

  // Blur the seam between the old and new panel so it reads as one change
  const panel = useRef(null)
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current && !reduced()) {
      panel.current?.animate([{ opacity: 0.4, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 180, easing: 'ease' })
    }
    mounted.current = true
  }, [selected])

  const stage = useRef(null)
  const changeView = (v) => {
    setView(v)
    if (!reduced()) stage.current?.animate([{ opacity: 0, filter: 'blur(4px)', transform: 'scale(0.98)' }, { opacity: 1, filter: 'blur(0)', transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Earth events</h1>
          <p>Open natural events tracked by NASA EONET: storms, wildfires, volcanoes and ice. Storm tracks show every reported position.</p>
        </div>
      </div>
      <BackendNotice />
      {status === 'loading' ? <Loading height={480} /> : status === 'ready' && !events.length ? (
        <div className="card empty"><b>No Earth events yet</b>They'll appear after the next nightly refresh from NASA.</div>
      ) : (
        <div className="earth-layout">
          <section className="card map-card">
            <div ref={stage}>
              {events.length > 0 && <Globe events={events} off={off} selected={selected} visible={view === 'globe'} />}
              {view === 'map' && <WorldMap events={events} selected={selected} isOn={(e) => !off.has(e.categoryId)} onPick={pick} />}
            </div>
            <div className="map-overlay">
              <div className="chips">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    className="chip"
                    type="button"
                    aria-pressed={!off.has(c.id)}
                    style={{ '--cat': catVar(c.id) }}
                    onClick={() => setOff((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}
                  >
                    <span className="cat-dot" />{c.label}<span className="n">{c.n}</span>
                  </button>
                ))}
              </div>
              <div className="map-tools">
                {ev && <a className="btn" href="#/earth" style={{ height: 28, background: 'var(--chip)', backdropFilter: 'blur(8px)' }}>Show all</a>}
                <Segmented options={[['globe', 'Globe'], ['map', 'Map']]} value={view} onChange={changeView} />
              </div>
            </div>
          </section>
          <div className="side">
            <section className="card" ref={panel}>{ev ? <Detail e={ev} /> : <Summary events={events} />}</section>
            <section className="card">
              <ul className="event-list">
                {list.length ? list.map((e) => (
                  <li key={e.eventId}>
                    <button type="button" aria-current={e.eventId === selected ? 'true' : undefined} onClick={() => pick(e.eventId)}>
                      <span className="cat-dot" style={{ '--cat': catVar(e.categoryId) }} />
                      <span style={{ minWidth: 0 }}><div className="t">{e.title}</div><div className="meta">{catLabel(e)} · {e.sourceId}</div></span>
                      <span className="meta num">{relDate(lastGeo(e).date)}</span>
                    </button>
                  </li>
                )) : <li className="empty"><b>No categories selected</b>Turn a category back on to see its events.</li>}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
