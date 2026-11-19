import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../lib/data.jsx'
import { reduced } from '../lib/motion.js'
import { absDate, esc, fmtKm, fmtLd, fmtSize, p2, plural, relDate, sizeM, toLd } from '../lib/format.js'
import { BackendNotice, CAT_LABELS, Icon, Loading, catVar, lastGeo } from '../components/common.jsx'
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

// A small live 3D view, loaded on demand so three.js stays out of the first download
function Mini3D({ kind, events, className, label }) {
  const host = useRef(null)
  const labels = useRef(null)
  useEffect(() => {
    let inst = null
    let stopped = false
    const load = kind === 'solar' ? import('../lib/solar3d.js') : import('../lib/globe3d.js')
    load.then((m) => {
      if (stopped) return
      inst = kind === 'solar'
        ? m.createScene(host.current, labels.current, { cam: [0, 10, 14], autoRotate: true, noZoom: true })
        : m.createGlobe(host.current, labels.current, events, { colorFor: catColor, onPick: () => go('#/earth', 'pointer'), dist: 3.1, zoom: false, spin: 0.5 })
      if (kind === 'solar') inst.setBelt(false)
    })
    return () => { stopped = true; inst?.destroy() }
  }, [kind, events])
  return (
    <div className={`mini3d ${className || ''}`} aria-label={label} role="img">
      <div className="mini3d-host" ref={host} />
      <div className="mini3d-labels" ref={labels} aria-hidden="true" />
    </div>
  )
}
const catColor = (id) => getComputedStyle(document.documentElement).getPropertyValue(`--c-${id}`).trim() || '#848b7e'

function Hero({ next, then }) {
  const { designation, distanceAu, fullName } = next
  const ld = toLd(distanceAu)
  return (
    <section className="card mc-hero">
      <div className="mc-hero-copy">
        <div>
          <div className="eyebrow"><span className="live" />Next close approach · {relDate(next.date)}</div>
          <h2>{fullName}</h2>
          <div className="badges">
            {next.pha ? <span className="badge pha">Potentially hazardous</span> : <span className="badge">Near-Earth</span>}
            {ld < 1 && <span className="badge accent">Inside the Moon's orbit</span>}
          </div>
        </div>
        <Countdown target={next.date.getTime()} />
        <dl className="mc-facts">
          <div><dt>Closest</dt><dd className="num">{fmtLd(distanceAu)} LD<span>{fmtKm(distanceAu)}</span></dd></div>
          <div><dt>Speed</dt><dd className="num">{next.relativeVelocity.toFixed(1)} km/s<span>relative to Earth</span></dd></div>
          <div><dt>Size</dt><dd className="num">≈ {fmtSize(next.absoluteMagnitude)}<span>{next.absoluteMagnitude != null ? `H ${next.absoluteMagnitude.toFixed(1)}` : 'estimated'}</span></dd></div>
          <div><dt>When</dt><dd className="num">{absDate(next.date, false)}<span>{p2(next.date.getUTCHours())}:{p2(next.date.getUTCMinutes())} UTC</span></dd></div>
        </dl>
        {then && <p className="mc-then faint">Then <a href={link(then.designation)}>{then.fullName}</a>, {relDate(then.date)}, at <b className="num">{fmtLd(then.distanceAu)} LD</b>{toLd(then.distanceAu) < 1 ? ', closer than the Moon' : ''}</p>}
        <div className="mc-actions">
          <a className="btn primary" href={`#/explorer/${encodeURIComponent(designation)}`}>Follow in Solar system <Icon name="arrow" /></a>
          <a className="btn" href={link(designation)}>Details</a>
        </div>
      </div>
      <Mini3D kind="solar" className="mc-solar" label="Live view of the inner solar system" />
      <span className="mc-tag" aria-hidden="true">Live · inner solar system</span>
    </section>
  )
}

function EarthCard({ events }) {
  const open = useMemo(() => events.filter((e) => !e.closed), [events])
  const cats = Object.entries(open.reduce((m, e) => ({ ...m, [e.categoryId]: (m[e.categoryId] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
  const latest = [...events].sort((a, b) => lastGeo(b).date - lastGeo(a).date).slice(0, 4)
  return (
    <section className="card mc-earth">
      {events.length > 0 ? <Mini3D kind="globe" events={events} className="mc-globe" label="Live globe of natural events" /> : <div className="mini3d mc-globe" />}
      <div className="mc-earth-copy">
        <div className="eyebrow"><span className="live" />Earth right now</div>
        <h3><b className="num">{open.length}</b> active {open.length === 1 ? 'event' : 'events'}</h3>
        <div className="mc-cats">{cats.map(([id, n]) => <span key={id}><i style={{ background: catVar(id) }} />{CAT_LABELS[id] || id} <b className="num">{n}</b></span>)}</div>
        <ul className="mc-list">
          {latest.map((e) => (
            <li key={e.eventId}>
              <a href={`#/earth/${e.eventId}`}>
                <i style={{ background: catVar(e.categoryId) }} />
                <span className="t">{e.title}</span>
                <span className="m faint">{e.closed ? 'ended' : relDate(lastGeo(e).date)}</span>
              </a>
            </li>
          ))}
        </ul>
        <a className="btn" href="#/earth">Open Earth events <Icon name="arrow" /></a>
      </div>
    </section>
  )
}

// A soft light follows the pointer across the card; only that element's transform changes
function Stat({ label, value, unit, tone, children }) {
  const spot = useRef(null)
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    spot.current.style.transform = `translate(${e.clientX - r.left - 150}px, ${e.clientY - r.top - 150}px)`
  }
  return (
    <div className={`card stat${tone ? ` ${tone}` : ''}`} onPointerMove={onMove}>
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
              <line x1={x(a.date).toFixed(1)} x2={x(a.date).toFixed(1)} y1={y(ld).toFixed(1)} y2={H - pad.b} className="stem" style={{ stroke: col }} />
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
  const { rows, events, status } = useData()
  if (status === 'loading') return <div className="mc"><div className="mc-wide"><Loading height={420} /></div></div>
  const now = Date.now()
  const upcoming = rows.filter((r) => r.date > now).sort((a, b) => a.date - b.date)
  const next = upcoming[0]
  if (!next) {
    return (
      <div className="mc">
        <div className="mc-wide"><BackendNotice /></div>
        {status === 'ready' && <div className="card empty mc-wide"><b>No upcoming approaches yet</b>They'll appear after the next refresh from NASA.</div>}
      </div>
    )
  }
  const insideMoon = upcoming.filter((r) => toLd(r.distanceAu) < 1)
  const phas = upcoming.filter((r) => r.pha)
  const open = events.filter((e) => !e.closed)
  const closest = [...upcoming].sort((a, b) => a.distanceAu - b.distanceAu).slice(0, 6)
  const today = new Date()

  return (
    <div className="mc">
      <div className="mc-head mc-wide">
        <div className="eyebrow">{absDate(today, true)}</div>
        <h1>Overview</h1>
      </div>
      <Hero next={next} then={upcoming[1]} />
      <EarthCard events={events} />
      <div className="mc-stats mc-wide">
        <Stat label="Close approaches" value={upcoming.length}><div className="sub">next 60 days, within 0.5 AU</div></Stat>
        <Stat label="Within 1 LD" value={insideMoon.length}><div className="sub">closer than the Moon</div></Stat>
        <Stat label={<>Potentially hazardous {phas.length > 0 && <span className="badge pha">PHA</span>}</>} value={phas.length} tone="pha"><div className="sub">passing this window</div></Stat>
        <Stat label={<span className="eyebrow"><span className="live" />Active Earth events</span>} value={open.length}><div className="sub">{plural(events.length, 'event', 'events')} in the feed</div></Stat>
      </div>
      <section className="card mc-chart">
        <div className="card-head">
          <div><div className="eyebrow">Next 60 days · distance in lunar distances (LD)</div><h3>Close approaches by distance</h3></div>
          <div className="mc-legend faint"><span><i style={{ background: 'var(--accent)' }} />Near-Earth</span><span><i style={{ background: 'var(--pha)' }} />Potentially hazardous</span><span>Dot size ≈ size</span></div>
        </div>
        <Timeline list={upcoming} />
      </section>
      <section className="card mc-passes">
        <div className="eyebrow">Coming up</div>
        <h3>Closest passes</h3>
        <ul className="mc-list">
          {closest.map((r) => (
            <li key={r.id ?? `${r.designation}${+r.date}`}>
              <a href={link(r.designation)}>
                <i style={{ background: r.pha ? 'var(--pha)' : 'var(--accent)' }} />
                <span className="t">{r.fullName}</span>
                <span className={`m num${toLd(r.distanceAu) < 1 ? ' close' : ''}`}>{fmtLd(r.distanceAu)} LD</span>
                <span className="m faint">{relDate(r.date)}</span>
              </a>
            </li>
          ))}
        </ul>
        <a className="btn" href="#/asteroids">All asteroids <Icon name="arrow" /></a>
      </section>
    </div>
  )
}
