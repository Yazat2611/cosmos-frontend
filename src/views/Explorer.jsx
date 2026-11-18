import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../components/common.jsx'
import { absDate, fmtKm, fmtLd, fmtSize, toLd } from '../lib/format.js'
import { go } from '../lib/ui.js'
import { PLANETS, jdFromMs, periodDays, positionAt } from '../lib/orbits.js'
import { useObjects } from './explorer/useObjects.js'

const Scene = lazy(() => import('./explorer/Scene.jsx'))

// Simulated days per real second
const RATES = [-365, -30, -7, -1, 0, 1, 7, 30, 365]
const rateLabel = (r) => (r === 0 ? 'Paused' : `${r < 0 ? '−' : ''}${Math.abs(r) === 365 ? '1 year' : Math.abs(r) === 30 ? '1 month' : Math.abs(r) === 7 ? '1 week' : '1 day'} / s`)

const SUN = { id: 'sun', kind: 'star', name: 'Sun' }

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function useClockDate(clock) {
  const [ms, setMs] = useState(clock.ms)
  useEffect(() => {
    const id = setInterval(() => setMs(clock.ms), 120)
    return () => clearInterval(id)
  }, [clock])
  return ms
}

// Closest passes to Earth in a window: real dates from the backend when it has them, else scanned from the sample orbits
function useApproaches(asteroids) {
  return useMemo(() => {
    const now = Date.now()
    const live = asteroids.filter((a) => a.approach && a.approach.date > now)
      .map((a) => ({ obj: a, ms: a.approach.date.getTime(), au: a.approach.distanceAu }))
    if (live.length) {
      const end = Math.max(...live.map((x) => x.ms))
      return { list: live, start: now, end: Math.max(end + 2 * 864e5, now + 30 * 864e5), live: true }
    }
    const end = now + 365 * 864e5
    const list = asteroids.map((a) => {
      let best = { au: Infinity, k: 0 }
      for (let k = 0; k <= 365; k++) {
        const jd = jdFromMs(now + k * 864e5)
        const d = dist(positionAt(a.el, jd, [0, 0, 0]), positionAt(PLANETS[2], jd, [0, 0, 0]))
        if (d < best.au) best = { au: d, k }
      }
      // A minimum at either end of the window is not a pass
      return best.k > 0 && best.k < 365 ? { obj: a, ms: now + best.k * 864e5, au: best.au } : null
    }).filter(Boolean)
    return { list, start: now, end, live: false }
  }, [asteroids])
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Timeline({ clock, rate, setRate, approaches, selected, onPick }) {
  const ms = useClockDate(clock)
  const idx = RATES.indexOf(rate)
  const step = (d) => setRate(RATES[Math.max(0, Math.min(RATES.length - 1, idx + d))])
  const d = new Date(ms)
  const iso = d.toISOString().slice(0, 10)
  const offset = Math.round((ms - Date.now()) / 864e5)
  const { list, start, end, live } = approaches
  const x = (t) => ((t - start) / (end - start)) * 100
  const maxLog = Math.log10(Math.max(1, ...list.map((a) => toLd(a.au))) + 1)
  const ticks = []
  const t0 = new Date(start)
  const daily = end - start < 100 * 864e5
  for (let k = 0; ; k++) {
    const t = daily ? Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate() + 7 * k + 1) : Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth() + k + 1, 1)
    if (t > end) break
    const td = new Date(t)
    ticks.push([t, daily ? `${td.getUTCDate()} ${MONTH[td.getUTCMonth()]}` : MONTH[td.getUTCMonth()]])
  }
  const cursor = x(ms)
  return (
    <section className="x-timeline" aria-label="Time controls and upcoming close approaches">
      <div className="x-tl-head">
        <div className="x-date">
          <input type="date" aria-label="Jump to date" value={iso} min="1900-01-01" max="2100-12-31"
            onChange={(e) => { const t = Date.parse(`${e.target.value}T00:00:00Z`); if (Number.isFinite(t)) clock.ms = t }} />
          <span className="faint num">{offset === 0 ? `${d.toISOString().slice(11, 16)} UTC · today` : `${offset > 0 ? '+' : '−'}${Math.abs(offset).toLocaleString()} days from today`}</span>
        </div>
        <div className="x-tl-title faint">{live ? 'Upcoming close approaches' : 'Closest passes in the next year · sample orbits'}</div>
        <div className="x-rates">
          <button type="button" className="icon-btn" aria-label="Slower or reverse" onClick={() => step(-1)} disabled={idx === 0}><Icon name="rewind" /></button>
          <button type="button" className="icon-btn x-play" aria-label={rate === 0 ? 'Play' : 'Pause'} onClick={() => setRate(rate === 0 ? 1 : 0)}><Icon name={rate === 0 ? 'play' : 'pause'} /></button>
          <button type="button" className="icon-btn" aria-label="Faster" onClick={() => step(1)} disabled={idx === RATES.length - 1}><Icon name="forward" /></button>
          <span className="x-rate num">{rateLabel(rate)}</span>
        </div>
        <button type="button" className="btn" onClick={() => { clock.ms = Date.now(); setRate(1) }}>Today</button>
      </div>
      <div className="x-track">
        {ticks.map(([t, l]) => <span key={t} className="x-tick" style={{ left: `${x(t)}%` }}>{l}</span>)}
        {list.map((a) => {
          const h = 14 + (1 - Math.log10(toLd(a.au) + 1) / maxLog) * 44
          const p = x(a.ms)
          const edge = p < 8 ? ' is-l' : p > 92 ? ' is-r' : ''
          return (
            <button key={a.obj.id} type="button" className={`x-ev${a.obj.pha ? ' is-pha' : ''}${selected === a.obj.id ? ' is-on' : ''}${edge}`}
              style={{ left: `${p}%`, '--h': `${h.toFixed(0)}px` }}
              aria-label={`${a.obj.fullName}, ${absDate(new Date(a.ms))}, ${fmtLd(a.au)} lunar distances`}
              onClick={() => { clock.ms = a.ms; setRate(0); onPick(a.obj.id) }}>
              <span className="stem" />
              <span className="tip">{a.obj.fullName}<br /><span className="num">{absDate(new Date(a.ms), false)} · {fmtLd(a.au)} LD</span></span>
            </button>
          )
        })}
        {cursor >= 0 && cursor <= 100 && <div className="x-cursor" style={{ left: `${cursor}%` }} />}
      </div>
    </section>
  )
}

// Distance from Earth over a year centred on the shown date
function DistanceChart({ obj, ms }) {
  const W = 300, H = 92, n = 120, from = ms - 182 * 864e5
  const el = obj.kind === 'planet' ? obj : obj.el
  const vals = []
  for (let k = 0; k <= n; k++) {
    const jd = jdFromMs(from + (k / n) * 365 * 864e5)
    vals.push(dist(positionAt(el, jd, [0, 0, 0]), positionAt(PLANETS[2], jd, [0, 0, 0])))
  }
  const max = Math.max(...vals) * 1.08
  const px = (k) => (k / n) * W
  const py = (v) => H - 14 - (v / max) * (H - 24)
  const line = vals.map((v, k) => `${k ? 'L' : 'M'}${px(k).toFixed(1)},${py(v).toFixed(1)}`).join('')
  const mi = vals.indexOf(Math.min(...vals))
  const color = obj.kind === 'planet' ? obj.color : obj.pha ? 'var(--pha)' : 'var(--accent)'
  const anchor = px(mi) > W - 60 ? 'end' : px(mi) < 60 ? 'start' : 'middle'
  const short = (t) => { const x = new Date(t); return `${x.getUTCDate()} ${MONTH[x.getUTCMonth()]}` }
  const minLabel = vals[mi] < 0.05 ? `${fmtLd(vals[mi])} LD` : `${vals[mi].toFixed(3)} AU`
  return (
    <div className="x-chart">
      <div className="faint">Distance from Earth · ±6 months</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Distance from Earth over a year; closest ${minLabel} on ${short(from + (mi / n) * 365 * 864e5)}`}>
        <path d={`${line}L${W},${H - 14}L0,${H - 14}Z`} fill="var(--accent-soft)" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.5" />
        <line x1={W / 2} x2={W / 2} y1="4" y2={H - 14} stroke="var(--text-3)" strokeDasharray="2 3" />
        <circle cx={px(mi)} cy={py(vals[mi])} r="3" fill={color} />
        <text x={Math.min(W - 2, Math.max(2, px(mi)))} y={Math.max(10, py(vals[mi]) - 6)} textAnchor={anchor}>{minLabel}</text>
        <text x="0" y={H - 2}>{short(from)}</text>
        <text x={W / 2} y={H - 2} textAnchor="middle">Shown date</text>
        <text x={W} y={H - 2} textAnchor="end">{short(from + 365 * 864e5)}</text>
      </svg>
    </div>
  )
}

function Fact({ k, children }) {
  return <div><dt>{k}</dt><dd>{children}</dd></div>
}

function Info({ obj, clock, setRate, onClose }) {
  const ms = useClockDate(clock)
  if (!obj) return null
  const jd = jdFromMs(ms)
  const earth = positionAt(PLANETS[2], jd, [0, 0, 0])
  const isPlanet = obj.kind === 'planet'
  const el = isPlanet ? obj.info : obj.el
  const pos = obj.kind === 'star' ? [0, 0, 0] : positionAt(isPlanet ? obj : obj.el, jd, [0, 0, 0])
  const rSun = Math.hypot(...pos)
  const rEarth = dist(pos, earth)
  const a = obj.approach
  const name = obj.name || obj.fullName

  return (
    <aside className="x-info" aria-label={`${name} details`}>
      <header>
        <div>
          <div className="faint x-kind">{obj.kind === 'star' ? 'Star' : isPlanet ? 'Planet' : obj.orbitClass ? `${obj.orbitClass} asteroid` : 'Asteroid'}</div>
          <h2>{name}</h2>
          <div className="badges">
            {obj.pha && <span className="badge pha">Potentially hazardous</span>}
            {obj.source === 'backend' && <span className="badge accent">Live from NASA</span>}
            {obj.source === 'sample' && <span className="badge" data-tip="Built-in sample with rounded elements">Sample orbit</span>}
          </div>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      </header>
      {obj.note && <p className="muted x-note">{obj.note}</p>}
      {obj.kind !== 'star' && obj.id !== 'earth' && <DistanceChart obj={obj} ms={Math.round(ms / 864e5) * 864e5} />}
      <dl className="kv">
        {obj.kind !== 'star' && <Fact k="From the Sun">{rSun.toFixed(3)} AU</Fact>}
        {obj.id !== 'earth' && <Fact k="From Earth">{rEarth < 0.5 ? `${fmtLd(rEarth)} LD` : `${rEarth.toFixed(3)} AU`} <span className="faint">· {fmtKm(rEarth)}</span></Fact>}
        {el && <>
          <Fact k="Semi-major axis">{el.a.toFixed(3)} AU</Fact>
          <Fact k="Eccentricity">{el.e.toFixed(4)}</Fact>
          <Fact k="Inclination">{(Math.abs(el.i) < 0.005 ? 0 : el.i).toFixed(2)}°</Fact>
          <Fact k="Orbital period">{(() => { const p = periodDays(el); return p > 730 ? `${(p / 365.25).toFixed(2)} yr` : `${p.toFixed(0)} d` })()}</Fact>
          <Fact k="Perihelion">{(el.a * (1 - el.e)).toFixed(3)} AU</Fact>
          <Fact k="Aphelion">{(el.a * (1 + el.e)).toFixed(3)} AU</Fact>
        </>}
        {obj.h != null && <Fact k="Est. diameter">~{fmtSize(obj.h)} <span className="faint">· H {obj.h.toFixed(1)}</span></Fact>}
      </dl>
      {a && (
        <div className="x-approach">
          <div>
            <div className="faint" style={{ fontSize: 12 }}>Close approach to Earth</div>
            <b>{absDate(a.date)}</b>
            <div className="muted" style={{ fontSize: 12.5 }}>{fmtLd(a.distanceAu)} LD · {a.relativeVelocity?.toFixed(1)} km/s</div>
          </div>
          <div className="x-approach-actions">
            <button type="button" className="btn" onClick={() => { clock.ms = a.date.getTime(); setRate(0) }}>Go to date</button>
            <a className="btn" href={`#/asteroids/${encodeURIComponent(obj.designation)}`}>Full details</a>
          </div>
        </div>
      )}
      {a && toLd(a.distanceAu) < 1 && <p className="faint x-note">Passes inside the Moon's orbit.</p>}
    </aside>
  )
}

function ObjectList({ planets, asteroids, selected, onSelect, liveCount, pending, status }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const t = q.trim().toLowerCase()
  const match = (o) => !t || (o.name || o.fullName).toLowerCase().includes(t)
  const list = [
    ...(filter === 'all' || filter === 'planets' ? [SUN, ...planets] : []),
    ...(filter === 'planets' ? [] : asteroids.filter((a) => filter !== 'pha' || a.pha)),
  ].filter(match)
  return (
    <aside className="x-list" aria-label="Objects">
      <label className="input search"><Icon name="search" /><input placeholder="Find a planet or asteroid" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="x-filters">
        {[['all', 'All'], ['pha', 'Hazardous'], ['planets', 'Planets']].map(([v, l]) => (
          <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <ul>
        {list.map((o) => (
          <li key={o.id}>
            <button type="button" aria-current={selected === o.id || undefined} onClick={() => onSelect(o.id)}>
              <span className="x-dot" style={{ background: o.kind === 'star' ? '#ffd889' : o.kind === 'planet' ? o.color : o.pha ? 'var(--pha)' : 'var(--accent)' }} />
              <span className="t">{o.name || o.fullName}</span>
              {o.approach && <span className="faint num m">{fmtLd(o.approach.distanceAu)} LD</span>}
            </button>
          </li>
        ))}
        {!list.length && <li className="faint" style={{ padding: '10px 12px' }}>Nothing matches.</li>}
      </ul>
      <div className="x-source faint">
        {status === 'error' ? 'Backend offline: showing sample asteroids.'
          : status === 'loading' ? 'Connecting to the backend…'
          : pending > 0 ? `Loading orbits from NASA… ${liveCount} ready`
          : `${liveCount} live ${liveCount === 1 ? 'orbit' : 'orbits'} from upcoming close approaches, plus notable asteroids.`}
        <br />Drag to orbit · scroll to zoom · space to pause
      </div>
    </aside>
  )
}

export function Explorer({ sub }) {
  const { asteroids, status, pending, liveCount } = useObjects()
  const clock = useRef(null)
  if (!clock.current) clock.current = { ms: Date.now(), jd: jdFromMs(Date.now()), rate: 1, playing: true }
  const [rate, setRateState] = useState(1)
  const [hovered, setHovered] = useState(null)
  const [showBelt, setShowBelt] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [listOpen, setListOpen] = useState(false)
  const selected = sub || null
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const mq = matchMedia('(max-width: 760px)')
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const setRate = useCallback((r) => {
    clock.current.rate = r
    clock.current.playing = r !== 0
    setRateState(r)
  }, [])
  const onSelect = useCallback((id) => {
    go(id ? `#/explorer/${encodeURIComponent(id)}` : '#/explorer')
    setListOpen(false)
  }, [])

  const all = useMemo(() => [SUN, ...PLANETS, ...asteroids], [asteroids])
  const approaches = useApproaches(asteroids)
  const obj = all.find((o) => o.id === selected)

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable]')) return
      if (e.key === ' ') { e.preventDefault(); setRate(clock.current.rate === 0 ? 1 : 0) }
      else if (e.key === 'Escape' && selected) onSelect(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, onSelect, setRate])

  return (
    <div className="explorer">
      <Suspense fallback={<div className="x-loading">Loading the solar system…</div>}>
        <Scene clock={clock.current} asteroids={asteroids} selected={selected} hovered={hovered}
          onSelect={onSelect} onHover={setHovered} showBelt={showBelt} showLabels={showLabels} viewShift={phone ? 0.24 : 0} />
      </Suspense>
      <div className="x-top">
        <button type="button" className="btn x-list-toggle" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}><Icon name="search" /> Objects</button>
        <div className="x-toggles">
          <button type="button" aria-pressed={showLabels} onClick={() => setShowLabels((v) => !v)}>Labels</button>
          <button type="button" aria-pressed={showBelt} onClick={() => setShowBelt((v) => !v)}>Main belt</button>
          {selected && <button type="button" onClick={() => onSelect(null)}>Reset view</button>}
        </div>
      </div>
      <div className={`x-list-wrap${listOpen ? ' is-open' : ''}`}>
        <ObjectList planets={PLANETS} asteroids={asteroids} selected={selected} onSelect={onSelect} liveCount={liveCount} pending={pending} status={status} />
      </div>
      <Info key={selected} obj={obj} clock={clock.current} setRate={setRate} onClose={() => onSelect(null)} />
      <Timeline clock={clock.current} rate={rate} setRate={setRate} approaches={approaches} selected={selected} onPick={onSelect} />
    </div>
  )
}
