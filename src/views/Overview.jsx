import { useEffect, useRef, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { flyby, reduced } from '../lib/motion.js'
import { absDate, esc, fmtLd, fmtLdValue, fmtSize, p2, plural, relDate, sizeM, toLd } from '../lib/format.js'
import { BackendNotice, Loading, catVar, lastGeo } from '../components/common.jsx'
import { WorldMap } from '../components/WorldMap.jsx'
import { go } from '../lib/ui.js'

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'
const link = (des) => `#/asteroids/${encodeURIComponent(des)}`

function Countdown({ target }) {
  const ref = useRef(null)
  useEffect(() => {
    let first = true
    const tick = () => {
      let ms = Math.max(0, target - Date.now())
      const d = Math.floor(ms / 864e5); ms -= d * 864e5
      const h = Math.floor(ms / 36e5); ms -= h * 36e5
      const m = Math.floor(ms / 6e4); ms -= m * 6e4
      const s = Math.floor(ms / 1e3)
      ;[['d', d], ['h', h], ['m', m], ['s', s]].forEach(([u, v]) => {
        const el = ref.current.querySelector(`[data-u=${u}]`)
        if (el.textContent === p2(v)) return
        el.textContent = p2(v)
        // Each changed unit rolls up into place, like a departures board
        if (!first && !reduced()) {
          el.animate([{ transform: 'translateY(55%)', opacity: 0, filter: 'blur(2px)' }, { transform: 'none', opacity: 1, filter: 'blur(0)' }], { duration: 320, easing: EASE_OUT })
        }
      })
      first = false
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [target])
  return (
    <div className="countdown" ref={ref} aria-label="Time until closest approach">
      <div><b data-u="d">00</b><span>days</span></div>
      <div><b data-u="h">00</b><span>hours</span></div>
      <div><b data-u="m">00</b><span>min</span></div>
      <div><b data-u="s">00</b><span>sec</span></div>
    </div>
  )
}

function Hero({ next }) {
  const canvas = useRef(null)
  const { designation, distanceAu, fullName } = next
  useEffect(() => {
    const scene = flyby(canvas.current, { ld: toLd(distanceAu), label: fullName, seed: designation, fmt: fmtLdValue })
    return () => scene.destroy()
  }, [designation, distanceAu, fullName])
  return (
    <section className="card hero">
      <div className="hero-copy">
        <div>
          <div className="eyebrow"><span className="live" />Next close approach</div>
          <h2>{fullName}</h2>
        </div>
        <Countdown target={next.date.getTime()} />
        <dl className="hero-facts">
          <div><dt>Miss distance</dt><dd>{fmtLd(distanceAu)} LD</dd></div>
          <div><dt>Velocity</dt><dd>{next.relativeVelocity.toFixed(1)} km/s</dd></div>
          <div><dt>Est. size</dt><dd>{fmtSize(next.absoluteMagnitude)}</dd></div>
        </dl>
        <div><a className="btn" href={link(designation)}>View orbit &amp; details</a></div>
      </div>
      <div className="hero-art">
        <canvas className="hero-canvas" ref={canvas} aria-label={`Animation of ${fullName} passing Earth at ${fmtLd(distanceAu)} lunar distances`} />
      </div>
    </section>
  )
}

// A soft light follows the pointer across the card; only that element's transform changes
function Stat({ label, value, unit, children }) {
  const spot = useRef(null)
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    spot.current.style.transform = `translate(${e.clientX - r.left - 150}px, ${e.clientY - r.top - 150}px)`
  }
  return (
    <div className="card stat" onPointerMove={onMove}>
      <span className="spot" ref={spot} />
      <div className="label">{label}</div>
      <div className="value">{value}{unit && <small>{unit}</small>}</div>
      {children}
    </div>
  )
}

function Timeline({ list }) {
  const wrap = useRef(null)
  const [size, setSize] = useState(null)
  const revealed = useRef(false)
  useEffect(() => {
    const el = wrap.current
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth - 12, H: el.clientHeight - 12 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // On first draw the dots sweep in from today toward day 60
  useEffect(() => { if (size) revealed.current = true }, [size])

  let svg = null
  if (size && size.W > 0) {
    const { W, H } = size
    const reveal = !revealed.current && !reduced()
    const pad = { l: 40, r: 10, t: 10, b: 26 }
    const t0 = list[0]?.date.getTime() < Date.now() ? list[0].date.getTime() : Date.now()
    const t1 = t0 + 60 * 864e5
    const x = (d) => pad.l + ((d - t0) / (t1 - t0)) * (W - pad.l - pad.r)
    const lmin = Math.log10(0.1)
    const lmax = Math.log10(200)
    const y = (ld) => pad.t + (1 - (Math.log10(Math.max(0.1, Math.min(200, ld))) - lmin) / (lmax - lmin)) * (H - pad.t - pad.b)
    const ticksX = []
    for (let i = 0; i <= 60; i += 10) ticksX.push(t0 + i * 864e5)
    const r = (h) => (h == null ? 2.5 : Math.max(2.5, Math.min(11, Math.sqrt(sizeM(h)) / 3.4)))
    svg = (
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <g className="grid">{[0.1, 1, 10, 100].map((v) => <line key={v} x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />)}</g>
        <g className="axis">
          {[0.1, 1, 10, 100].map((v) => <text key={v} x={pad.l - 8} y={y(v) + 4} textAnchor="end">{v}</text>)}
          {ticksX.map((v, i) => <text key={v} x={x(v)} y={H - 6} textAnchor={i === 0 ? 'start' : i === ticksX.length - 1 ? 'end' : 'middle'}>{i === 0 ? 'Today' : absDate(new Date(v), false)}</text>)}
        </g>
        <line x1={pad.l} x2={W - pad.r} y1={y(1)} y2={y(1)} style={{ stroke: 'rgba(var(--ov),.3)' }} strokeDasharray="3 4" />
        <text x={W - pad.r} y={y(1) - 6} textAnchor="end" style={{ fill: 'rgba(var(--ov),.55)' }} fontSize="11">Moon</text>
        {list.map((a) => {
          const ld = toLd(a.distanceAu)
          const col = a.pha ? 'var(--pha)' : ld < 1 ? 'var(--danger)' : 'var(--accent)'
          return (
            <g
              key={a.id}
              className={`dot-ast${reveal ? ' reveal' : ''}`}
              style={{ '--d': `${reveal ? Math.round(((a.date - t0) / (t1 - t0)) * 700 + 150) : 0}ms` }}
              data-des={a.designation}
              data-tip={`<b>${esc(a.fullName)}</b><br>${fmtLd(a.distanceAu)} LD · ${a.relativeVelocity.toFixed(1)} km/s · ~${fmtSize(a.absoluteMagnitude)}<br><span class='faint'>${absDate(a.date)}</span>`}
            >
              <circle cx={x(a.date).toFixed(1)} cy={y(ld).toFixed(1)} r={r(a.absoluteMagnitude).toFixed(1)} fill={col} fillOpacity=".22" stroke={col} strokeWidth="1.2" />
            </g>
          )
        })}
      </svg>
    )
  }
  return (
    <div
      className="timeline-wrap"
      ref={wrap}
      onClick={(e) => { const g = e.target.closest('[data-des]'); if (g) go(link(g.dataset.des), 'pointer') }}
    >
      {svg}
    </div>
  )
}

export function Overview() {
  const { rows, events, status, hazard } = useData()
  if (status === 'loading') return <div className="ov-grid"><div style={{ gridColumn: 'span 12' }}><Loading /></div></div>
  const upcoming = rows.filter((r) => r.date > Date.now())
  const open = events.filter((e) => !e.closed)
  const next = upcoming[0]
  if (!next) {
    return (
      <div>
        <BackendNotice />
        {status === 'ready' && <div className="card empty"><b>No upcoming approaches yet</b>They'll appear after the next nightly refresh from NASA.</div>}
      </div>
    )
  }
  const closest = upcoming.reduce((m, r) => (r.distanceAu < m.distanceAu ? r : m))
  const fastest = upcoming.reduce((m, r) => (r.relativeVelocity > m.relativeVelocity ? r : m))
  const insideMoon = upcoming.filter((r) => toLd(r.distanceAu) < 1).length
  const phas = upcoming.filter((r) => r.pha)
  const scanning = hazard.checked < hazard.total

  return (
    <div className="ov-grid">
      <Hero next={next} />
      <Stat label="Approaches, next 60 days" value={upcoming.length}><div className="sub">Within 0.5 AU of Earth</div></Stat>
      <Stat label="Closest pass" value={fmtLd(closest.distanceAu)} unit="LD">
        <a className="sub" href={link(closest.designation)}>{closest.fullName} · {absDate(closest.date, false)}</a>
      </Stat>
      <Stat label="Fastest" value={fastest.relativeVelocity.toFixed(1)} unit="km/s">
        <a className="sub" href={link(fastest.designation)}>{fastest.fullName}</a>
      </Stat>
      <Stat label={<>Potentially hazardous {phas.length > 0 && <span className="badge pha">PHA</span>}</>} value={phas.length}>
        <div className="sub">{scanning ? `Checking ${hazard.checked} of ${hazard.total} with NASA…` : `${plural(insideMoon, 'pass', 'passes')} inside the Moon's orbit`}</div>
      </Stat>

      <section className="card timeline-card">
        <div className="card-head">
          <h2>Next 60 days · miss distance (lunar distances, log)</h2>
          <span className="faint" style={{ fontSize: 12 }}>Dot size ≈ estimated diameter</span>
        </div>
        <Timeline list={upcoming} />
      </section>

      <section className="card events-card">
        <div className="card-head">
          <h2>Open Earth events</h2>
          <a className="btn ghost" href="#/earth" style={{ height: 26, padding: '0 8px' }}>{open.length} open</a>
        </div>
        <a className="mini-map" href="#/earth" aria-label="Open the Earth events map"><WorldMap events={open} mini /></a>
        <ul className="ev-list">
          {open.slice().sort((a, b) => lastGeo(b).date - lastGeo(a).date).slice(0, 4).map((e) => (
            <li key={e.eventId}>
              <a href={`#/earth/${e.eventId}`}>
                <span className="cat-dot" style={{ '--cat': catVar(e.categoryId) }} />
                <span className="t">{e.title}</span>
                <span className="faint num" style={{ fontSize: 12 }}>{relDate(lastGeo(e).date)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

