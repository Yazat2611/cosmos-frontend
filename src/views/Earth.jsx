import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { absDate, plural, relDate } from '../lib/format.js'
import { go } from '../lib/ui.js'
import { reduced } from '../lib/motion.js'
import { BackendNotice, Icon, Segmented, catLabel, catVar, lastGeo } from '../components/common.jsx'

const DAY = 864e5
const pick = (id) => go(id ? `#/earth/${encodeURIComponent(id)}` : '#/earth', 'pointer')
const catColor = (id) => getComputedStyle(document.documentElement).getPropertyValue(`--c-${id}`).trim() || '#848b7e'
const fmtLatLon = (g) => `${Math.abs(g.latitude).toFixed(1)}° ${g.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(g.longitude).toFixed(1)}° ${g.longitude >= 0 ? 'E' : 'W'}`
const shortDate = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// Great-circle length of a track, in km
function trackKm(e) {
  let km = 0
  const r = Math.PI / 180
  for (let k = 1; k < e.geometries.length; k++) {
    const a = e.geometries[k - 1], b = e.geometries[k]
    const h = Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2
    km += 2 * 6371 * Math.asin(Math.sqrt(h))
  }
  return km
}

// The globe itself, lazy-loaded with three.js the first time the page opens
function Globe3D({ events, selected, timeMs, filter }) {
  const host = useRef(null)
  const labels = useRef(null)
  const globe = useRef(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    import('../lib/globe3d.js').then(({ createGlobe }) => {
      if (!live) return
      globe.current = createGlobe(host.current, labels.current, events, { colorFor: catColor, onPick: pick })
      setReady(true)
    })
    return () => { live = false; globe.current?.destroy(); globe.current = null; setReady(false) }
  }, [events])
  useEffect(() => { if (ready) globe.current.select(selected) }, [ready, selected])
  useEffect(() => { if (ready) globe.current.setFilter(filter) }, [ready, filter])
  useEffect(() => { if (ready) globe.current.setTime(timeMs ?? null) }, [ready, timeMs])
  return (
    <div className="g-scene">
      <div className="g-canvas" ref={host} aria-label="Interactive globe of Earth events. Drag to spin, scroll to zoom." role="img" />
      <div className="x-labels g-labels" ref={labels} aria-hidden="true" />
      {!ready && <div className="x-loading">Loading the globe…</div>}
    </div>
  )
}

// Sustained wind over a storm's life, with Saffir–Simpson category 1 and 4 thresholds for reference
function WindChart({ e }) {
  const pts = e.geometries.filter((g) => g.magnitudeValue != null)
  if (pts.length < 2) return null
  const unit = pts[0].magnitudeUnit || ''
  const kts = /kt/i.test(unit)
  const W = 300, H = 88
  const t0 = +pts[0].date, t1 = +pts.at(-1).date
  const max = Math.max(kts ? 140 : 0, ...pts.map((p) => p.magnitudeValue)) * 1.05
  const x = (t) => ((t - t0) / (t1 - t0 || 1)) * W
  const y = (v) => H - 14 - (v / max) * (H - 22)
  const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(+p.date).toFixed(1)},${y(p.magnitudeValue).toFixed(1)}`).join('')
  const color = catVar(e.categoryId)
  return (
    <div className="x-chart">
      <div className="faint">{kts ? 'Sustained wind (kt)' : `Magnitude (${unit})`}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${kts ? 'Wind speed' : 'Magnitude'} over time, peaking at ${Math.max(...pts.map((p) => p.magnitudeValue))} ${unit}`}>
        {kts && [[64, 'Cat 1'], [113, 'Cat 4']].map(([v, l]) => (
          <g key={v}><line x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.16)" strokeDasharray="2 3" /><text x="2" y={y(v) - 3}>{l} · {v} kt</text></g>
        ))}
        <path d={`${line}L${x(t1)},${H - 14}L0,${H - 14}Z`} fill={`color-mix(in srgb, ${color} 14%, transparent)`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" />
        {pts.map((p, k) => <circle key={k} cx={x(+p.date)} cy={y(p.magnitudeValue)} r="2" fill={color} />)}
        <text x="0" y={H - 2}>{shortDate(t0)}</text>
        <text x={W} y={H - 2} textAnchor="end">{shortDate(t1)}</text>
      </svg>
    </div>
  )
}

function Detail({ e }) {
  const g = lastGeo(e)
  const mags = e.geometries.filter((x) => x.magnitudeValue != null)
  const peak = mags.length ? mags.reduce((m, x) => (x.magnitudeValue > m.magnitudeValue ? x : m)) : null
  const kts = peak && /kt/i.test(peak.magnitudeUnit || '')
  return (
    <section className="g-detail" aria-label={e.title}>
      <header>
        <div>
          <div className="faint g-kind"><span className="cat-dot" style={{ '--cat': catVar(e.categoryId) }} />{catLabel(e)}</div>
          <h2>{e.title}</h2>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => pick(null)}><Icon name="close" /></button>
      </header>
      {e.description && <p className="muted x-note">{e.description}</p>}
      <WindChart e={e} />
      <dl className="kv">
        <div><dt>Status</dt><dd>{e.closed ? 'Ended' : <span className="g-live">Active</span>}</dd></div>
        <div><dt>First reported</dt><dd>{absDate(e.geometries[0].date, false)}</dd></div>
        <div><dt>Last update</dt><dd>{relDate(g.date)}</dd></div>
        <div><dt>Location</dt><dd className="num">{fmtLatLon(g)}</dd></div>
        {peak && <div><dt>{kts ? 'Peak wind' : 'Peak magnitude'}</dt><dd className="num">{peak.magnitudeValue.toLocaleString()} {peak.magnitudeUnit}{kts && <span className="faint g-sub">{Math.round(peak.magnitudeValue * 1.852)} km/h · {shortDate(peak.date)}</span>}</dd></div>}
        {e.geometries.length > 1 && <div><dt>Track</dt><dd className="num">{Math.round(trackKm(e)).toLocaleString()} km<span className="faint g-sub">{plural(e.geometries.length, 'report', 'reports')}</span></dd></div>}
      </dl>
      {e.link && <a className="btn g-link" href={e.link} target="_blank" rel="noopener noreferrer"><Icon name="ext" />EONET record</a>}
    </section>
  )
}

function LivePanel({ events, off, setOff, showEnded, setShowEnded, selected }) {
  const pool = events.filter((e) => showEnded || !e.closed)
  const cats = useMemo(() => {
    const m = new Map()
    pool.forEach((e) => m.set(e.categoryId, { id: e.categoryId, label: catLabel(e), n: (m.get(e.categoryId)?.n || 0) + 1 }))
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [pool])
  const list = pool.filter((e) => !off.has(e.categoryId)).sort((a, b) => lastGeo(b).date - lastGeo(a).date)
  const open = events.filter((e) => !e.closed).length
  return (
    <aside className="g-panel" aria-label="Events">
      <div><div className="faint g-kind">Earth right now</div><h1>{plural(open, 'active event', 'active events')}</h1></div>
      <div className="g-chips">
        {cats.map((c) => (
          <button key={c.id} type="button" aria-pressed={!off.has(c.id)} style={{ '--cat': catVar(c.id) }}
            onClick={() => setOff((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}>
            <span className="cat-dot" />{c.label}<span className="faint num">{c.n}</span>
          </button>
        ))}
      </div>
      <label className="g-toggle"><input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> Show ended events</label>
      <ul className="g-list">
        {list.length ? list.map((e) => (
          <li key={e.eventId}>
            <button type="button" aria-current={e.eventId === selected ? 'true' : undefined} onClick={() => pick(e.eventId)}>
              <span className="cat-dot" style={{ '--cat': catVar(e.categoryId) }} />
              <span className="t">{e.title}</span>
              <span className="faint num m">{relDate(lastGeo(e).date)}</span>
            </button>
          </li>
        )) : <li className="faint g-empty">No events match these filters.</li>}
      </ul>
    </aside>
  )
}

// Replays the window as a moving date: events appear on their first report and tracks grow
function useReplay(events, on) {
  const range = useMemo(() => {
    const end = Date.now()
    const first = Math.min(...events.map((e) => +e.geometries[0].date))
    const start = Math.max(end - 60 * DAY, Math.min(end - 14 * DAY, Number.isFinite(first) ? first : end - 30 * DAY))
    return { start, end }
  }, [events])
  const [t, setT] = useState(range.start)
  const [playing, setPlaying] = useState(true)
  const tRef = useRef(range.start)
  useEffect(() => {
    if (!on) return
    tRef.current = range.start
    setT(range.start)
    setPlaying(!reduced())
  }, [on, range])
  useEffect(() => {
    if (!on || !playing) return
    let raf = 0, last = performance.now(), shown = 0
    const speed = (range.end - range.start) / 14 // the whole window in about 14 seconds
    const loop = (now) => {
      tRef.current = Math.min(range.end, tRef.current + Math.min(now - last, 100) / 1000 * speed)
      last = now
      // The globe follows every frame; the text only a few times a second
      if (now - shown > 120 || tRef.current >= range.end) { shown = now; setT(tRef.current) }
      if (tRef.current >= range.end) { setPlaying(false); return }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [on, playing, range])
  const seek = (ms) => { tRef.current = ms; setT(ms); setPlaying(false) }
  const toggle = () => {
    if (!playing && tRef.current >= range.end) { tRef.current = range.start; setT(range.start) }
    setPlaying((p) => !p)
  }
  return { t, playing, toggle, seek, ...range }
}

function ReplayBar({ events, r }) {
  const days = Math.ceil((r.end - r.start) / DAY)
  const cats = [...new Set(events.map((e) => e.categoryId))]
  const bars = Array.from({ length: days }, (_, k) => {
    const d0 = r.start + k * DAY
    return cats.map((c) => events.filter((e) => e.categoryId === c && +e.geometries[0].date >= d0 && +e.geometries[0].date < d0 + DAY).length)
  })
  const max = Math.max(1, ...bars.map((b) => b.reduce((s, n) => s + n, 0)))
  const W = 600, H = 44, bw = W / days
  const p = (r.t - r.start) / (r.end - r.start)
  return (
    <section className="g-replay" aria-label="Replay controls">
      <button type="button" className="icon-btn x-play" aria-label={r.playing ? 'Pause' : 'Play'} onClick={r.toggle}><Icon name={r.playing ? 'pause' : 'play'} /></button>
      <div className="g-rtrack">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {bars.map((b, k) => {
            let y = H
            return cats.map((c, j) => {
              if (!b[j]) return null
              const h = (b[j] / max) * (H - 6)
              y -= h
              return <rect key={`${k}-${c}`} x={k * bw + bw * 0.25} y={y} width={bw * 0.5} height={Math.max(1, h - 1)} rx="1" fill={catVar(c)} />
            })
          })}
        </svg>
        <div className="g-head" style={{ transform: `translateX(${(p * 100).toFixed(3)}%)` }} />
        <input type="range" min="0" max="1000" value={Math.round(p * 1000)} aria-label="Replay position"
          onChange={(e) => r.seek(r.start + (Number(e.target.value) / 1000) * (r.end - r.start))} />
        <div className="g-ticks faint"><span>{shortDate(r.start)}</span><span>{shortDate((r.start + r.end) / 2)}</span><span>Today</span></div>
      </div>
    </section>
  )
}

function ReplayPanel({ events, t }) {
  const active = events.filter((e) => +e.geometries[0].date <= t && (!e.closed || +lastGeo(e).date + 2 * DAY >= t)).length
  const feed = events.filter((e) => +e.geometries[0].date <= t).sort((a, b) => b.geometries[0].date - a.geometries[0].date).slice(0, 5)
  return (
    <aside className="g-panel g-tally" aria-label="Replay">
      <div className="faint g-kind">Replay</div>
      <h1 className="num">{absDate(new Date(t), false)}</h1>
      <div className="faint">{plural(active, 'event active', 'events active')}</div>
      <ul className="g-list">
        {feed.map((e) => (
          <li key={e.eventId}>
            <button type="button" onClick={() => pick(e.eventId)}>
              <span className="cat-dot" style={{ '--cat': catVar(e.categoryId) }} />
              <span className="t">{e.title}</span>
              <span className="faint num m">{shortDate(e.geometries[0].date)}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function Earth({ sub }) {
  const { events, status } = useData()
  const [mode, setMode] = useState('live')
  const [off, setOff] = useState(() => new Set())
  const [showEnded, setShowEnded] = useState(false)
  const ev = sub ? events.find((e) => e.eventId === sub) : null
  const selected = ev?.eventId || null
  const replay = useReplay(events, mode === 'replay')

  const filter = useMemo(
    () => (mode === 'replay' ? () => true : (e) => !off.has(e.categoryId) && (showEnded || !e.closed || e.eventId === selected)),
    [mode, off, showEnded, selected],
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable]')) return
      if (e.key === 'Escape' && selected) pick(null)
      else if (e.key === ' ' && mode === 'replay') { e.preventDefault(); replay.toggle() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, mode, replay])

  return (
    <div className={`explorer earth-x${selected ? ' has-sel' : ''}`}>
      {events.length > 0 && <Globe3D events={events} selected={selected} filter={filter} timeMs={mode === 'replay' ? replay.t : null} />}
      {status === 'loading' && <div className="x-loading">Loading Earth events…</div>}
      {status === 'error' && <div className="g-notice"><BackendNotice /></div>}
      {status === 'ready' && !events.length && <div className="x-loading"><div className="card empty"><b>No Earth events yet</b>They'll appear after the next refresh from NASA.</div></div>}
      {events.length > 0 && <>
        <div className="g-mode"><Segmented options={[['live', 'Live'], ['replay', 'Replay']]} value={mode} onChange={setMode} /></div>
        {mode === 'live'
          ? <LivePanel events={events} off={off} setOff={setOff} showEnded={showEnded} setShowEnded={setShowEnded} selected={selected} />
          : <ReplayPanel events={events} t={replay.t} />}
        {ev && <div className="g-right"><Detail key={ev.eventId} e={ev} /></div>}
        {mode === 'replay' && <ReplayBar events={events} r={replay} />}
        {mode === 'live' && <div className="g-hint faint"><span className="g-sun" />Lit side matches the Sun's position now · drag to spin, scroll to zoom</div>}
      </>}
    </div>
  )
}
